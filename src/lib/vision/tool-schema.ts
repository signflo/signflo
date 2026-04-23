import "server-only";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Tool schema passed to Opus for structured extraction.
 * Mirrors src/lib/vision/types.ts.
 */
export const extractAgreementTool: Anthropic.Tool = {
  name: "record_extracted_agreement",
  description:
    "Record the structured fields, signature blocks, and visual style fingerprint extracted from a document image or PDF. Use this tool exactly once per document.",
  input_schema: {
    type: "object",
    required: ["schema", "styleFingerprint", "lowConfidenceFieldIds"],
    properties: {
      schema: {
        type: "object",
        required: ["title", "documentType", "fields", "signatureBlocks"],
        properties: {
          title: { type: "string" },
          documentType: { type: "string" },
          purpose: { type: "string" },
          clauseStructure: { type: "string" },
          workflowHints: {
            type: "array",
            items: { type: "string" },
          },
          fields: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "label", "type", "required", "confidence"],
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                type: {
                  type: "string",
                  enum: [
                    "text",
                    "textarea",
                    "email",
                    "phone",
                    "date",
                    "number",
                    "checkbox",
                    "radio",
                    "select",
                    "signature",
                    "initials",
                    "file",
                  ],
                },
                required: { type: "boolean" },
                hint: { type: "string" },
                placeholder: { type: "string" },
                options: { type: "array", items: { type: "string" } },
                positionHint: {
                  type: "object",
                  required: ["page", "x", "y", "w", "h"],
                  properties: {
                    page: { type: "integer" },
                    x: { type: "number" },
                    y: { type: "number" },
                    w: { type: "number" },
                    h: { type: "number" },
                  },
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
          signatureBlocks: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "role", "order"],
              properties: {
                id: { type: "string" },
                role: { type: "string" },
                requiresInitials: { type: "boolean" },
                order: { type: "integer" },
                positionHint: {
                  type: "object",
                  required: ["page", "x", "y", "w", "h"],
                  properties: {
                    page: { type: "integer" },
                    x: { type: "number" },
                    y: { type: "number" },
                    w: { type: "number" },
                    h: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
      styleFingerprint: {
        type: "object",
        required: ["palette", "typography", "layout", "clauseNumbering", "signatureBlockLayout"],
        properties: {
          palette: {
            type: "object",
            required: ["primary", "text", "background"],
            properties: {
              primary: { type: "string" },
              secondary: { type: "string" },
              text: { type: "string" },
              background: { type: "string" },
            },
          },
          typography: {
            type: "object",
            required: ["titleFontFamily", "titleFontWeight", "bodyFontFamily", "bodyFontSize"],
            properties: {
              titleFontFamily: { type: "string" },
              titleFontWeight: { type: "string" },
              bodyFontFamily: { type: "string" },
              bodyFontSize: { type: "string" },
              monoFontFamily: { type: "string" },
            },
          },
          layout: {
            type: "object",
            required: ["pageSize", "orientation", "margins", "logoPresent"],
            properties: {
              pageSize: { type: "string", enum: ["letter", "a4", "legal", "other"] },
              orientation: { type: "string", enum: ["portrait", "landscape"] },
              margins: { type: "string" },
              header: { type: "string" },
              footer: { type: "string" },
              logoPresent: { type: "boolean" },
              logoPosition: {
                type: "string",
                enum: ["top-left", "top-center", "top-right"],
              },
            },
          },
          clauseNumbering: {
            type: "string",
            enum: ["none", "1.", "1.1", "(a)", "roman", "other"],
          },
          signatureBlockLayout: {
            type: "string",
            enum: ["single-column", "two-column", "inline", "other"],
          },
          notes: { type: "string" },
        },
      },
      lowConfidenceFieldIds: {
        type: "array",
        items: { type: "string" },
        description:
          "IDs of fields where extraction confidence is below 0.7 or the field is ambiguous and may need human review.",
      },
    },
  },
};
