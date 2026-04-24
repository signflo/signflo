import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL } from "./client";
import { extractAgreementTool } from "./tool-schema";
import { parseExtractionResult, type ExtractInput } from "./extract";
import type { ExtractionResult } from "./types";

const VERIFY_SYSTEM_PROMPT = `You are Signflo's extraction-verification agent. A previous agent produced a schema and style fingerprint from this document. Your job is to spot mistakes and improve the result.

Focus in this order:

## 1. Remove hallucinated fields (highest priority)

If the prior extraction emitted a field with a hint like "Not explicitly present", "commonly captured", "usually required", "implied", etc., **DELETE IT**. Convert it to a \`workflowHints\` entry instead. A Signflo agreement must only contain fields that are actually visible as form elements on the page. A missing field we can add later is safer than a phantom field we silently include.

## 2. Collapse mutually-exclusive checkboxes into radios

If the prior extraction emitted N separate checkbox fields for options that are logically mutually exclusive (payment methods, card brands, inspection periods, plan tiers), **merge them** into a single \`type: "radio"\` field with the choices in the \`options\` array. Delete the individual checkbox entries. This is the single biggest cleanup win in documents like vendor invoices and service proposals.

Leave separate checkboxes ONLY when each checkbox can be independently checked (feature opt-ins, acknowledgement toggles, "select all that apply").

## 3. Promote repeating patterns to fieldGroups

If the prior extraction emitted ≥2 instances of the same field template flat (e.g. \`alt-address-1-street\`, \`alt-address-1-city\`, ..., \`alt-address-5-zip\`), move them into a \`FieldGroup\` in \`fieldGroups\`. The flat entries should disappear from \`fields\` once moved. Pick \`initialInstances\` to match the visible row count in the source; set \`minInstances\` to the number of required rows (usually 1).

Do NOT group fields that are visually similar but semantically distinct (home phone / work phone / cell phone, or email / alternate email). Those are separate fields.

## 4. Populate signerRole on every signature block

If any signature block is missing \`signerRole\`, add it:
- "self" — the current signer should sign here (default for the primary signature block on a customer-facing document)
- "co-signer" — another signer on the same side
- "counterparty" — opposing party signs later
- "pre-signed" — already signed (manufacturer MCO signature, dealer pre-signature)

Use document context to pick. If the block is clearly already signed in the source image (e.g. a signature line with a printed signature above it), mark "pre-signed".

## 4b. Re-attribute notary / official / vendor fields with \`filledByRole\`

Walk the prior extraction's fields. For any field that the prior pass left as default (filledByRole undefined / "self") but is clearly filled by a non-self party in the source, set \`filledByRole\` to the correct role:

- Notary appearance line, notary date, notary commission expiration → \`"counterparty"\`
- Recording / clerk fields (file number, record date, deputy signature line) → \`"counterparty"\`
- Vendor rep name, employee number, branch ID on a customer-facing form → \`"counterparty"\`
- Pre-printed customer data we decided to keep as a field → \`"pre-signed"\`

Test: if the field's blank sits adjacent to a counterparty signature block, it's almost always filled by that counterparty.

## 4c. Section assignment for renderer grouping

If the prior pass omitted \`section\` on fields and the source document visibly groups them (named panels, headers, or framed regions), assign sections. Use the SAME exact string for fields in the same group. Keep section names short and reusable. Forms with ≤8 fields can omit sections entirely.

## 5. Correct errors on real fields

- Fields that were missed entirely (visibly present in the source but not captured).
- Fields mis-typed (e.g. a date labeled as "text", an email labeled as "text").
- Signature blocks that were overlooked.

## 6. Constraints — strip incorrect ones, add missing ones

**Strip any constraint whose \`fieldIds\` span semantically unrelated decisions.** For example, a \`one-of\` that references both a payment option and an equipment selection is wrong — those aren't alternatives of the same decision. Delete it.

**Strip \`one-of\` constraints whose member fields are already the options of a collapsed radio field.** Those are redundant.

Add missing constraints only when the document explicitly or strongly implies them and they pass the semantic-homogeneity test (every member field is an alternative of the same decision or a related completion requirement). When in doubt, leave them out.

The \`all-or-none\` kind is the most broadly useful (conditional-completion patterns). Favor it over \`one-of\` when both could technically apply.

## 7. Style fingerprint sanity check

- Wrong font family category (serif vs sans).
- Wrong page size or orientation.
- Missed logo or miscategorized logo position.

## 8. Confidence calibration

Confidence above 0.85 should mean "I can see this field and its type unambiguously." If the prior pass gave high confidence to something the label or position makes genuinely ambiguous, lower it and add the ID to \`lowConfidenceFieldIds\`.

Respond by invoking \`record_extracted_agreement\` once with the corrected result. Preserve IDs from the previous result for fields that remain unchanged.`;

export async function verifyExtraction(
  input: ExtractInput,
  prior: ExtractionResult,
): Promise<ExtractionResult> {
  const client = getAnthropic();

  const contentBlocks: Anthropic.ContentBlockParam[] = [];

  if (input.kind === "image") {
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: input.mediaType as
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp",
        data: input.data.toString("base64"),
      },
    });
  } else {
    contentBlocks.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: input.data.toString("base64"),
      },
    });
  }

  // Reshape the prior for Opus using the renamed `agreement` property so the
  // model sees the same top-level keys it is expected to emit.
  const priorForModel = {
    agreement: prior.schema,
    styleFingerprint: prior.styleFingerprint,
    lowConfidenceFieldIds: prior.lowConfidenceFieldIds,
  };

  contentBlocks.push({
    type: "text",
    text: `Prior extraction (to review and correct):\n\n${JSON.stringify(priorForModel, null, 2)}\n\nCall the record_extracted_agreement tool once with the corrected result. Populate the THREE top-level properties — \`agreement\`, \`styleFingerprint\`, and \`lowConfidenceFieldIds\` — as siblings. Do NOT nest them inside each other.`,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: VERIFY_SYSTEM_PROMPT,
    tools: [extractAgreementTool],
    tool_choice: { type: "tool", name: extractAgreementTool.name },
    messages: [{ role: "user", content: contentBlocks }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Verification pass did not invoke the tool");
  }

  return parseExtractionResult(toolUse.input);
}
