import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL } from "./client";
import { extractAgreementTool } from "./tool-schema";
import type { ExtractionResult } from "./types";

const SYSTEM_PROMPT = `You are Signflo's agreement-ingestion agent. Given an image or PDF of a document, you produce two things in a single structured response:

1. A machine-readable schema describing every fillable field and signature block that IS ACTUALLY PRESENT in the source document, with position hints (0-1 normalized coordinates within each page), type, required/optional status, and self-reported confidence per field.

2. A visual style fingerprint that another agent will use to re-render the agreement at high fidelity: color palette, typography (font family and size guesses — use common Google Fonts names where possible: Inter, Source Serif 4, Source Sans 3, Georgia, Times New Roman, Helvetica, Arial, Merriweather, IBM Plex Sans/Serif/Mono, etc.), layout, header/footer content, logo presence and position, clause numbering style, signature block layout.

## Critical correctness rule (non-negotiable)

**Only emit fields that correspond to a visible form element in the source document** — an actual blank line, text-input box, checkbox, radio option, signature line, or similar. Do NOT emit fields that are "commonly" expected in similar documents but absent from THIS one. It is far better to miss a plausibly-implied field than to invent one.

If something feels relevant but you cannot point to a specific visible mark on the page, put it in \`workflowHints\` or the style fingerprint's \`notes\` — not in \`fields\`.

Red-flag patterns that MUST go into \`workflowHints\` (not \`fields\`):
- "Commonly captured alongside signature"
- "Probably filled in by hand"
- "Usually required but not shown"
- "Implied but not explicit"

## Other guidelines

- Invent stable string IDs for fields and signature blocks (e.g. "party-a-name", "effective-date", "sig-party-a").
- Set \`confidence\` below 0.7 for any field where the label or type is ambiguous, and include its ID in \`lowConfidenceFieldIds\`.
- Prefer specific field types (\`email\`, \`date\`, \`phone\`) over generic \`text\` when the label signals the format.
- If the document has numbered clauses, note the numbering style in \`clauseNumbering\`.
- If no field is present at all (e.g. an informational doc), return an empty \`fields\` array but still produce a signature block if one is implied and visible.
- Respond ONLY by invoking the \`record_extracted_agreement\` tool exactly once. Do not include any other text.`;

export interface ExtractInput {
  kind: "image" | "pdf";
  mediaType: string;
  data: Buffer;
  /** Optional extracted text layer (digital PDFs) to enrich extraction */
  textLayer?: string;
}

export async function extractAgreement(input: ExtractInput): Promise<ExtractionResult> {
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

  if (input.textLayer && input.textLayer.trim().length > 0) {
    contentBlocks.push({
      type: "text",
      text: `Extracted text layer from the PDF (use as ground truth for text content, but rely on the document image for layout/styling):\n\n---\n${input.textLayer.slice(0, 50_000)}\n---`,
    });
  }

  contentBlocks.push({
    type: "text",
    text: "Extract the agreement schema and style fingerprint by calling the record_extracted_agreement tool exactly once.",
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: [extractAgreementTool],
    tool_choice: { type: "tool", name: extractAgreementTool.name },
    messages: [{ role: "user", content: contentBlocks }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Opus did not invoke the extraction tool; response was: " + JSON.stringify(response.content));
  }

  return toolUse.input as ExtractionResult;
}
