import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./index";
import type { AgreementSchema, StyleFingerprint } from "@/lib/vision/types";

export interface AgreementRecord {
  id: string;
  shortId: string;
  title: string;
  sourceKind: "image" | "pdf";
  sourcePath: string;
  schema: AgreementSchema;
  styleFingerprint: StyleFingerprint | null;
  lowConfidenceFieldIds: string[];
  createdAt: Date;
}

export async function getAgreementByShortId(shortId: string): Promise<AgreementRecord | null> {
  const db = getDb();
  const rows = await db.select().from(schema.agreements).where(eq(schema.agreements.shortId, shortId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    shortId: row.shortId,
    title: row.title,
    sourceKind: row.sourceKind,
    sourcePath: row.sourcePath,
    schema: row.schemaJson as AgreementSchema,
    styleFingerprint: (row.styleFingerprintJson ?? null) as StyleFingerprint | null,
    lowConfidenceFieldIds: (row.lowConfidenceFieldsJson ?? []) as string[],
    createdAt: row.createdAt,
  };
}

export async function getAgreementById(id: string): Promise<AgreementRecord | null> {
  const db = getDb();
  const rows = await db.select().from(schema.agreements).where(eq(schema.agreements.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    shortId: row.shortId,
    title: row.title,
    sourceKind: row.sourceKind,
    sourcePath: row.sourcePath,
    schema: row.schemaJson as AgreementSchema,
    styleFingerprint: (row.styleFingerprintJson ?? null) as StyleFingerprint | null,
    lowConfidenceFieldIds: (row.lowConfidenceFieldsJson ?? []) as string[],
    createdAt: row.createdAt,
  };
}

export interface SubmissionRecord {
  id: string;
  shortId: string;
  agreementId: string;
  data: Record<string, unknown>;
  status: "started" | "submitted" | "signed";
  createdAt: Date;
  submittedAt: Date | null;
}

export async function getSubmissionByShortId(shortId: string): Promise<SubmissionRecord | null> {
  const db = getDb();
  const rows = await db.select().from(schema.submissions).where(eq(schema.submissions.id, shortId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    shortId: row.id,
    agreementId: row.agreementId,
    data: row.dataJson as Record<string, unknown>,
    status: row.status,
    createdAt: row.createdAt,
    submittedAt: row.submittedAt,
  };
}
