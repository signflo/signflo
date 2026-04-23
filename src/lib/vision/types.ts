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

export interface SignatureBlock {
  id: string;
  role: string;
  requiresInitials?: boolean;
  order: number;
  positionHint?: { page: number; x: number; y: number; w: number; h: number };
}

export interface AgreementSchema {
  title: string;
  documentType: string;
  purpose?: string;
  fields: AgreementField[];
  signatureBlocks: SignatureBlock[];
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
