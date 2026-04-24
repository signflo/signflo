import "server-only";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Tool schema passed to Opus for structured extraction.
 * Mirrors src/lib/vision/types.ts.
 */

const positionHintSchema = {
  type: "object",
  required: ["page", "x", "y", "w", "h"],
  properties: {
    page: { type: "integer" },
    x: { type: "number" },
    y: { type: "number" },
    w: { type: "number" },
    h: { type: "number" },
  },
} as const;

const fieldSchema = {
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
    options: {
      type: "array",
      items: { type: "string" },
      description:
        "Required for 'radio' and 'select' types — the collapsed list of mutually-exclusive choices. Use this when you see a group of checkboxes that are logically mutually exclusive (e.g. payment options, inspection periods): emit ONE field of type 'radio' with the choices in this array, rather than N separate checkbox fields.",
    },
    section: {
      type: "string",
      description:
        "Optional grouping label for visual sectioning in the renderer (e.g. 'Contact Info', 'Service Address', 'Specialized Services', 'Payment'). Different from FieldGroup — sections are display-only headings, not repeating templates. Use a section name when the source document visibly groups N fields under a heading or visual region. Use a SHORT, REUSABLE name so multiple fields share it. Omit for forms small enough that grouping adds no value (≤8 fields total).",
    },
    filledByRole: {
      type: "string",
      enum: ["self", "co-signer", "counterparty", "pre-signed"],
      description:
        "Which role fills this field. Defaults to 'self' if omitted. Use 'counterparty' for fields that are visibly filled by an opposing party / official (e.g. notary's appearance line, county clerk's stamp date, vendor's invoice number). Use 'pre-signed' for fields already populated on the source document. This drives workflow step assignment.",
    },
    positionHint: positionHintSchema,
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

export const extractAgreementTool: Anthropic.Tool = {
  name: "record_extracted_agreement",
  description:
    "Record the structured fields, signature blocks, visual style fingerprint, and cross-field constraints extracted from a document image or PDF. Use this tool exactly once per document. The tool takes THREE separate top-level properties — `agreement`, `styleFingerprint`, and `lowConfidenceFieldIds` — not one combined result.",
  input_schema: {
    type: "object",
    required: ["agreement", "styleFingerprint", "lowConfidenceFieldIds"],
    properties: {
      agreement: {
        type: "object",
        required: [
          "title",
          "documentType",
          "fields",
          "fieldGroups",
          "signatureBlocks",
          "constraints",
        ],
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
            description:
              "Flat fields. Do NOT include fields that belong to a repeating template (those go in fieldGroups[].template). Do NOT include fields that should be collapsed into a 'radio' (those become the 'options' of a single radio field).",
            items: fieldSchema,
          },
          fieldGroups: {
            type: "array",
            description:
              "Repeating templates — use when the document has ≥2 instances of the same field pattern, e.g. a 5-row table where each row has {street, city, state, zip}. Fields inside a group's template DO NOT also appear in the top-level fields[] array. Emit an empty array if the document has no grouped fields.",
            items: {
              type: "object",
              required: ["id", "label", "template", "minInstances", "initialInstances"],
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                template: {
                  type: "array",
                  description:
                    "Per-instance fields. Each field's id must be unique within this template.",
                  items: fieldSchema,
                },
                minInstances: {
                  type: "integer",
                  minimum: 0,
                  description: "Minimum number of instances the signer must fill.",
                },
                maxInstances: {
                  type: "integer",
                  description: "Hard cap on instances; omit for unbounded.",
                },
                initialInstances: {
                  type: "integer",
                  minimum: 0,
                  description:
                    "How many empty rows to render by default. Use the number of visible rows in the source document when matching the source visually matters; use 1 for an 'Add another' UX.",
                },
              },
            },
          },
          signatureBlocks: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "role", "signerRole", "order"],
              properties: {
                id: { type: "string" },
                role: {
                  type: "string",
                  description:
                    "Human-readable role, e.g. 'Purchaser', 'Authorized Representative', 'Witness'.",
                },
                signerRole: {
                  type: "string",
                  enum: ["self", "co-signer", "counterparty", "pre-signed"],
                  description:
                    "Structural role. 'self' = current user should sign now. 'co-signer' = additional signer on the same side. 'counterparty' = opposing party will sign. 'pre-signed' = already signed (e.g. manufacturer MCO pre-signature), render as static.",
                },
                requiresInitials: { type: "boolean" },
                order: { type: "integer" },
                positionHint: positionHintSchema,
              },
            },
          },
          constraints: {
            type: "array",
            description:
              "Cross-field rules the document expresses. Emit an empty array if there are none. Use this for 'exactly one must be selected' / 'at least N must be filled' / 'all or none' patterns that are otherwise only expressible in workflowHints.",
            items: {
              oneOf: [
                {
                  type: "object",
                  required: ["id", "kind", "fieldIds"],
                  properties: {
                    id: { type: "string" },
                    kind: { const: "one-of" },
                    fieldIds: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 2,
                      description:
                        "Exactly one of these field IDs must be truthy (checked or non-empty).",
                    },
                    message: { type: "string" },
                  },
                },
                {
                  type: "object",
                  required: ["id", "kind", "fieldIds", "n"],
                  properties: {
                    id: { type: "string" },
                    kind: { const: "at-least-n" },
                    fieldIds: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 1,
                    },
                    n: { type: "integer", minimum: 1 },
                    message: { type: "string" },
                  },
                },
                {
                  type: "object",
                  required: ["id", "kind", "fieldIds"],
                  properties: {
                    id: { type: "string" },
                    kind: { const: "all-or-none" },
                    fieldIds: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 2,
                      description:
                        "Either all of these fields are filled, or none of them are (partial co-signer info, partial address, etc.).",
                    },
                    message: { type: "string" },
                  },
                },
              ],
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
            required: [
              "titleFontFamily",
              "titleFontWeight",
              "bodyFontFamily",
              "bodyFontSize",
            ],
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
              pageSize: {
                type: "string",
                enum: ["letter", "a4", "legal", "other"],
              },
              orientation: {
                type: "string",
                enum: ["portrait", "landscape"],
              },
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
