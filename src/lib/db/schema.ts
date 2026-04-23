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
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  agreementId: text("agreement_id")
    .notNull()
    .references(() => agreements.id),
  dataJson: text("data_json", { mode: "json" }).notNull(),
  status: text("status", {
    enum: ["started", "submitted", "signed"],
  }).notNull(),
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

export type Agreement = typeof agreements.$inferSelect;
export type NewAgreement = typeof agreements.$inferInsert;
export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type Signature = typeof signatures.$inferSelect;
export type NewSignature = typeof signatures.$inferInsert;
