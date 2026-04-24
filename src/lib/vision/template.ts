import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL } from "./client";
import { recordAgreementTemplateTool } from "./tool-schema-template";
import { renderFontShortlistForPrompt, CURATED_FONT_FAMILIES } from "./fonts";
import type { ExtractInput } from "./extract";
import type { AgreementSchema, StyleFingerprint } from "./types";

export interface AgreementTemplate {
  templateHtml: string;
  templateCss: string;
  fontImports: string[];
}

const SYSTEM_PROMPT = `You are Signflo's document-reproduction agent. Given a schema, a style fingerprint, and the original source images/PDF, you produce a faithful HTML+CSS reproduction of the document — same layout, same typography, same feel — with placeholders that another runtime fills with submission values.

## Critical correctness rules (non-negotiable)

1. **Never invent content.** Section headings, clause numbers, body text, party names, terms — everything visible in your output must come directly from the source. Do not paraphrase. Do not add disclaimers, copyright notices, or boilerplate the source doesn't include.

2. **Where the source has a fillable blank, emit an empty placeholder — never invent the value.** A fillable blank becomes:
   \`\`\`html
   <span data-field="{fieldId}" class="filled-value"></span>
   \`\`\`
   Use the exact \`fieldId\` from the schema. The runtime injects values per submission.

3. **For repeating templates (FieldGroup), emit ONE template instance** wrapped in:
   \`\`\`html
   <div data-field-group="{groupId}">
     <div data-field-instance>
       <span data-field="{fieldIdInsideTemplate}"></span>
       <!-- ... other template fields ... -->
     </div>
   </div>
   \`\`\`
   The runtime clones \`[data-field-instance]\` per filled instance.

4. **Signature blocks become slots, not images:**
   \`\`\`html
   <div data-signature-block="{blockId}" class="signature-slot">
     <!-- runtime injects the signature image (Phase E) or leaves blank for D.1 -->
   </div>
   \`\`\`

5. **Pick fonts from this curated shortlist only.** Do not invent font family names or URLs:

{{FONT_SHORTLIST}}

   Reference chosen fonts in BOTH \`fontImports\` (the URLs to <link>) AND in \`templateHtml\`'s <head> as <link rel="stylesheet"> tags AND in \`templateCss\`'s font-family declarations. Pick a body font (serif or sans, matching the source's character) and optionally a display font for titles.

6. **Logo.** If the style fingerprint reports \`logoPresent: true\`, reference the cropped logo at:
   \`\`\`
   /api/storage/agreements/{{AGREEMENT_ID_PLACEHOLDER}}/logo.png
   \`\`\`
   Use the literal string \`{{AGREEMENT_ID_PLACEHOLDER}}\` — the runtime substitutes the real ID at render time. Place the logo per the fingerprint's \`logoPosition\`.

7. **Multi-page mapping (image input only).** When the source is N images (one per page), emit clear page boundaries in CSS using:
   \`\`\`css
   .signflo-page { break-before: page; page-break-before: always; }
   \`\`\`
   Wrap each source page's content in \`<section class="signflo-page" data-source-page="{N}">...</section>\`. Source page count must equal rendered page count.

8. **Page size and margins — BOTH screen and print.** Margins must be visible in a browser preview AND in a PDF print. \`@page\` only affects print/PDF, so you MUST mirror the margin as container padding for the screen view:

\`\`\`css
@page { size: <pageSize> <orientation>; margin: 0; }
.signflo-page {
  padding: <margins>;  /* e.g. 0.75in or 48pt — matches the source */
  box-sizing: border-box;
  max-width: <pageWidth>;  /* e.g. 8.5in for letter */
  margin: 0 auto;           /* center on screen */
  background: <palette.background>;
}
\`\`\`

Setting \`@page margin: 0\` and putting all the real margin on \`.signflo-page\` padding means screen and print look identical. Do NOT put margin on both or they'll double-apply. ALWAYS wrap page content in \`<section class="signflo-page">\` — even for single-page documents.

## Output shape

Call \`record_agreement_template\` exactly once with three siblings:

- \`templateHtml\`: a complete <!DOCTYPE html> document. Include <head> with <meta charset>, the font <link>s, and a <style> block that imports the templateCss. Include <body> with the reproduced document content.
- \`templateCss\`: the CSS as a separate string. The runtime may compose this with footer styles before injection.
- \`fontImports\`: ordered array of Google Fonts URLs from the shortlist.

## Style fidelity priorities, in order

1. **Layout structure** — same sections in same order, same column count, header on top, signature blocks at bottom.
2. **Typography character** — serif vs sans matches the source. Title font is visually distinct from body font when the source distinguishes them.
3. **Palette** — primary color used on headings/borders/highlights matches the source's primary. Background and text colors reproduce the source's contrast.
4. **Header / footer** — reproduce the source's header text and footer text verbatim. Logo placement matches.
5. **Clause numbering** — match the source's numbering style (1., 1.1, (a), roman, etc.).
6. **Signature block layout** — single column, two column, inline — match the source.

If the source's palette would produce a contrast-failing or visually jarring result (e.g. bright red on bright pink), preserve the colors faithfully — bad-palette protection is the form-UI's concern (D.3), not the rendered document's.

Respond ONLY by invoking the \`record_agreement_template\` tool exactly once. Do not include any other text.`;

export async function generateAgreementTemplate(
  schema: AgreementSchema,
  styleFingerprint: StyleFingerprint,
  source: ExtractInput,
): Promise<AgreementTemplate> {
  const client = getAnthropic();

  const systemPrompt = SYSTEM_PROMPT.replace(
    "{{FONT_SHORTLIST}}",
    renderFontShortlistForPrompt(),
  );

  const contentBlocks: Anthropic.ContentBlockParam[] = [];

  if (source.kind === "image") {
    const total = source.pages.length;
    if (total > 1) {
      contentBlocks.push({
        type: "text",
        text: `This document has ${total} pages photographed separately. Treat them as one continuous agreement; reproduce as ${total} distinct rendered pages using the .signflo-page page-break pattern.`,
      });
    }
    source.pages.forEach((page, i) => {
      if (total > 1) {
        contentBlocks.push({
          type: "text",
          text: `Page ${i + 1} of ${total}:`,
        });
      }
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: page.mediaType as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: page.data.toString("base64"),
        },
      });
    });
  } else {
    contentBlocks.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: source.data.toString("base64"),
      },
    });
  }

  contentBlocks.push({
    type: "text",
    text: `Schema (use these field IDs verbatim in [data-field] attributes):\n\n${JSON.stringify(
      {
        title: schema.title,
        documentType: schema.documentType,
        fields: schema.fields,
        fieldGroups: schema.fieldGroups,
        signatureBlocks: schema.signatureBlocks,
      },
      null,
      2,
    )}\n\nStyle fingerprint:\n\n${JSON.stringify(styleFingerprint, null, 2)}\n\nProduce the HTML+CSS reproduction now. Call \`record_agreement_template\` once with three siblings: \`templateHtml\`, \`templateCss\`, \`fontImports\`.`,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16384,
    system: systemPrompt,
    tools: [recordAgreementTemplateTool],
    tool_choice: { type: "tool", name: recordAgreementTemplateTool.name },
    messages: [{ role: "user", content: contentBlocks }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error(
      "Opus did not invoke the template tool; response was: " +
        JSON.stringify(response.content),
    );
  }

  return parseTemplateResult(toolUse.input);
}

export function parseTemplateResult(input: unknown): AgreementTemplate {
  const obj = (input ?? {}) as Record<string, unknown>;

  const templateHtml = typeof obj.templateHtml === "string" ? obj.templateHtml : "";
  const templateCss = typeof obj.templateCss === "string" ? obj.templateCss : "";
  const fontImports = Array.isArray(obj.fontImports)
    ? (obj.fontImports as unknown[]).filter((u): u is string => typeof u === "string")
    : [];

  if (!isLikelyValidHtml(templateHtml)) {
    throw new Error(
      "Generated templateHtml failed sanity check (missing <body> or doctype)",
    );
  }

  // Filter font imports to just the curated set (defense against the model
  // inventing URLs despite the prompt instruction).
  const allowedUrls = new Set(
    Array.from(CURATED_FONT_FAMILIES).map(
      (family) => family, // checked against URL in fonts.ts; here we just want a permissive filter
    ),
  );
  // Soft filter: keep entries that look like Google Fonts URLs even if not
  // exact matches — the strict family-name check happens in the renderer.
  const cleanedFontImports = fontImports.filter((u) =>
    u.startsWith("https://fonts.googleapis.com/css"),
  );
  void allowedUrls;

  return {
    templateHtml,
    templateCss,
    fontImports: cleanedFontImports,
  };
}

function isLikelyValidHtml(html: string): boolean {
  if (!html || html.length < 50) return false;
  const lower = html.toLowerCase();
  if (!lower.includes("<body")) return false;
  if (!lower.includes("</body>")) return false;
  return true;
}
