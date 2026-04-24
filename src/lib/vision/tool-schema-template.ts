import "server-only";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Phase D.1 — tool schema for the per-document HTML template generation pass.
 *
 * Mirrors the rendering contract documented in docs/phase-d-d1-plan.md.
 *
 * The model returns three siblings:
 * - `templateHtml` — complete <!DOCTYPE html> document with [data-field] placeholders
 * - `templateCss` — CSS injected into the template's <head>; kept separate so we
 *    can compose with footer styles in D.2 without touching the model output
 * - `fontImports` — Google Fonts URLs to <link> in <head>, picked from the
 *    curated shortlist in src/lib/vision/fonts.ts
 */

export const recordAgreementTemplateTool: Anthropic.Tool = {
  name: "record_agreement_template",
  description:
    "Record a faithful HTML+CSS reproduction of the source document with [data-field] placeholders for fillable values, [data-field-group]/[data-field-instance] for repeating templates, and [data-signature-block] for signature regions. Use this tool exactly once per document. Do NOT invent content not present in the source.",
  input_schema: {
    type: "object",
    required: ["templateHtml", "templateCss", "fontImports"],
    properties: {
      templateHtml: {
        type: "string",
        description:
          "Complete <!DOCTYPE html> document. Section headings, clause numbering, and body text MUST come from the source — do not invent. Where the source has a fillable blank, emit an empty <span data-field=\"{fieldId}\"></span> (or an analogous block element if the field's source layout warrants block display). For repeating templates, wrap N instances in <div data-field-group=\"{groupId}\"><div data-field-instance>...</div></div>. For signature blocks, emit <div data-signature-block=\"{blockId}\" class=\"signature-slot\"></div>. Reference the curated Google Fonts via <link rel=\"stylesheet\" href=\"...\"> in <head>. Reference the cropped logo (when logoPresent) at /api/storage/agreements/{agreementId}/logo.png — the runtime will inject the correct agreementId before render.",
      },
      templateCss: {
        type: "string",
        description:
          "CSS rules applied via a <style> block in <head>. Translate the style fingerprint into concrete rules: typography (use @import or rely on the <link> in templateHtml), palette colors, page size + margins via @page, header/footer styling, signature block layout, clause numbering aesthetic. For multi-page image inputs, include `break-before: page` on the appropriate section selectors so source pages map 1:1 to rendered pages.",
      },
      fontImports: {
        type: "array",
        items: { type: "string" },
        description:
          "Ordered array of Google Fonts CSS URLs to load. Pick from the curated shortlist provided in the user prompt — do NOT invent URLs. Typically 1-3 entries (e.g. one body family + one display family). The runtime appends matching <link rel=\"stylesheet\"> tags before render.",
      },
    },
  },
};
