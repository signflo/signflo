import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";

export const agreements = sqliteTable("agreements", {
  id: text("id").primaryKey(),
  shortId: text("short_id").notNull().unique(),
  title: text("title").notNull(),
  sourceKind: text("source_kind", { enum: ["image", "pdf"] }).notNull(),
  sourcePath: text("source_path").notNull(),
  schemaJson: text("schema_json", { mode: "json" }).notNull(),
  styleFingerprintJson: text("style_fingerprint_json", { mode: "json" }),
  lowConfidenceFieldsJson: text("low_confidence_fields_json", { mode: "json" }),
  /** Ordered array of WorkflowStep (src/lib/workflow/types.ts). Nullable for pre-migration rows. */
  workflowStepsJson: text("workflow_steps_json", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  agreementId: text("agreement_id")
    .notNull()
    .references(() => agreements.id),
  dataJson: text("data_json", { mode: "json" }).notNull(),
  status: text("status", {
    enum: ["draft", "started", "submitted", "signed"],
  }).notNull(),
  /** Index into agreement.workflow_steps. -1 = workflow complete. */
  currentStepIndex: integer("current_step_index").notNull().default(0),
  /** Ordered array of WorkflowTransition (src/lib/workflow/types.ts). */
  historyJson: text("history_json", { mode: "json" }),
  pdfPath: text("pdf_path"),
  pdfSha256: text("pdf_sha256"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
  signedAt: integer("signed_at", { mode: "timestamp_ms" }),
});

export const signatures = sqliteTable("signatures", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => submissions.id),
  fieldId: text("field_id").notNull(),
  imagePath: text("image_path").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * URL-as-bearer-token ownership. Anyone with the token has owner access to
 * the submission at /s/{token}. Multiple tokens per submission are supported
 * (future: viewer/reviewer tokens) but MVP only mints "owner".
 */
export const submissionTokens = sqliteTable("submission_tokens", {
  /** 32-char URL-safe base64 string (~192 bits entropy). */
  token: text("token").primaryKey(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => submissions.id),
  role: text("role", { enum: ["owner", "viewer", "reviewer"] })
    .notNull()
    .default("owner"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type Agreement = typeof agreements.$inferSelect;
export type NewAgreement = typeof agreements.$inferInsert;
export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type Signature = typeof signatures.$inferSelect;
export type NewSignature = typeof signatures.$inferInsert;
export type SubmissionToken = typeof submissionTokens.$inferSelect;
export type NewSubmissionToken = typeof submissionTokens.$inferInsert;
