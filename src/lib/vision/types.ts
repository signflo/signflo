/**
 * Shared types for extracted agreement schemas + style fingerprints.
 * Deliberately permissive — Opus decides the shape, we mirror it.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "date"
  | "number"
  | "checkbox"
  | "radio"
  | "select"
  | "signature"
  | "initials"
  | "file";

export interface AgreementField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  hint?: string;
  placeholder?: string;
  options?: string[];
  /** Normalized x/y/w/h within the source page, 0–1 */
  positionHint?: { page: number; x: number; y: number; w: number; h: number };
  /** Opus's self-reported confidence, 0–1 */
  confidence: number;
}

/**
 * A repeating template — e.g. a 5-row table of shipping addresses where each row
 * has {street, city, state, zip}. Grouped fields live ONLY inside
 * `FieldGroup.template` — they do NOT also appear in `AgreementSchema.fields[]`.
 * The renderer iterates both `fields` and `fieldGroups`.
 */
export interface FieldGroup {
  id: string;
  label: string;
  /** Per-instance template. Each field's `id` must be unique within the template. */
  template: AgreementField[];
  /** Minimum number of instances the signer must fill. */
  minInstances: number;
  /** Hard cap on instances; omit for unbounded. */
  maxInstances?: number;
  /** How many empty rows to render by default. 1 for "Add another" UX; N to match source visually. */
  initialInstances: number;
}

/**
 * How a signature block relates to the current user:
 * - "self"        — the current user should sign now
 * - "co-signer"   — another signer on the same side as self (e.g. spouse, business partner)
 * - "counterparty" — an opposing party will sign later
 * - "pre-signed"  — already signed; render as static (e.g. manufacturer MCO signature)
 */
export type SignerRole = "self" | "co-signer" | "counterparty" | "pre-signed";

export interface SignatureBlock {
  id: string;
  /** Free-text human-readable role, e.g. "Purchaser", "Authorized Representative". */
  role: string;
  /** Structural role — drives how the signing UI treats this block. */
  signerRole: SignerRole;
  requiresInitials?: boolean;
  order: number;
  positionHint?: { page: number; x: number; y: number; w: number; h: number };
}

/**
 * Cross-field constraints expressed in the schema (not inferred from hints).
 * Discriminated union on `kind` so future additions are append-only.
 */
export type AgreementConstraint =
  | {
      id: string;
      kind: "one-of";
      /** Exactly one of these field IDs must be truthy (checked / non-empty). */
      fieldIds: string[];
      message?: string;
    }
  | {
      id: string;
      kind: "at-least-n";
      fieldIds: string[];
      n: number;
      message?: string;
    }
  | {
      id: string;
      kind: "all-or-none";
      fieldIds: string[];
      message?: string;
    };

export interface AgreementSchema {
  title: string;
  documentType: string;
  purpose?: string;
  /** Flat fields. Does NOT include fields inside `fieldGroups[].template`. */
  fields: AgreementField[];
  /** Repeating templates. Empty array if the document has no grouped fields. */
  fieldGroups: FieldGroup[];
  signatureBlocks: SignatureBlock[];
  /** Cross-field rules. Empty array if the document has no such constraints. */
  constraints: AgreementConstraint[];
  clauseStructure?: string;
  workflowHints?: string[];
}

export interface StyleFingerprint {
  palette: {
    primary: string;
    secondary?: string;
    text: string;
    background: string;
  };
  typography: {
    titleFontFamily: string;
    titleFontWeight: string;
    bodyFontFamily: string;
    bodyFontSize: string;
    monoFontFamily?: string;
  };
  layout: {
    pageSize: "letter" | "a4" | "legal" | "other";
    orientation: "portrait" | "landscape";
    margins: string;
    header?: string;
    footer?: string;
    logoPresent: boolean;
    logoPosition?: "top-left" | "top-center" | "top-right";
  };
  clauseNumbering: "none" | "1." | "1.1" | "(a)" | "roman" | "other";
  signatureBlockLayout: "single-column" | "two-column" | "inline" | "other";
  notes?: string;
}

export interface ExtractionResult {
  schema: AgreementSchema;
  styleFingerprint: StyleFingerprint;
  lowConfidenceFieldIds: string[];
}
