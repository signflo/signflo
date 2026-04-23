import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL } from "./client";
import { extractAgreementTool } from "./tool-schema";
import type { ExtractInput } from "./extract";
import type { ExtractionResult } from "./types";

const VERIFY_SYSTEM_PROMPT = `You are Signflo's extraction-verification agent. A previous agent produced a schema and style fingerprint from this document. Your job is to spot mistakes and improve the result.

Focus in this order:

## 1. Remove hallucinated fields (highest priority)

If the prior extraction emitted a field with a hint like "Not explicitly present", "commonly captured", "usually required", "implied", etc., **DELETE IT**. Convert it to a \`workflowHints\` entry instead. A Signflo agreement must only contain fields that are actually visible as form elements on the page. A missing field we can add later is safer than a phantom field we silently include.

## 2. Correct errors on real fields

- Fields that were missed entirely (visibly present in the source but not captured).
- Fields mis-typed (e.g. a date labeled as "text", an email labeled as "text").
- Signature blocks that were overlooked.

## 3. Style fingerprint sanity check

- Wrong font family category (serif vs sans).
- Wrong page size or orientation.
- Missed logo or miscategorized logo position.

## 4. Confidence calibration

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

  contentBlocks.push({
    type: "text",
    text: `Prior extraction (to review and correct):\n\n${JSON.stringify(prior, null, 2)}`,
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

  return toolUse.input as ExtractionResult;
}
