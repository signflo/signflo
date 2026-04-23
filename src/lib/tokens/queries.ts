import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { generateToken } from "./mint";
import type { AgreementRecord, SubmissionRecord } from "@/lib/db/queries";
import { getAgreementById } from "@/lib/db/queries";
import type { WorkflowTransition } from "@/lib/workflow/types";

export type SubmissionTokenRole = "owner" | "viewer" | "reviewer";

export interface TokenContext {
  token: string;
  role: SubmissionTokenRole;
  submission: SubmissionRecord;
  agreement: AgreementRecord;
}

/**
 * Mint a new bearer token for a submission. Defaults to the "owner" role.
 * Returns the raw token string — caller is responsible for surfacing it
 * exactly once (e.g. in an API response) and never re-logging it.
 */
export async function mintSubmissionToken(
  submissionId: string,
  role: SubmissionTokenRole = "owner",
): Promise<string> {
  const db = getDb();
  const token = generateToken();
  await db.insert(schema.submissionTokens).values({
    token,
    submissionId,
    role,
    createdAt: new Date(),
  });
  return token;
}

/**
 * Look up a token and return the submission + agreement it grants access to.
 * Returns null if the token doesn't exist; callers should 404 in that case
 * rather than leaking "token not found" vs "submission not found".
 */
export async function getTokenContext(token: string): Promise<TokenContext | null> {
  const db = getDb();
  const tokenRows = await db
    .select()
    .from(schema.submissionTokens)
    .where(eq(schema.submissionTokens.token, token))
    .limit(1);
  const tokenRow = tokenRows[0];
  if (!tokenRow) return null;

  const subRows = await db
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.id, tokenRow.submissionId))
    .limit(1);
  const subRow = subRows[0];
  if (!subRow) return null;

  const agreement = await getAgreementById(subRow.agreementId);
  if (!agreement) return null;

  const submission: SubmissionRecord = {
    id: subRow.id,
    shortId: subRow.id,
    agreementId: subRow.agreementId,
    data: subRow.dataJson as Record<string, unknown>,
    status: subRow.status as SubmissionRecord["status"],
    currentStepIndex: subRow.currentStepIndex ?? 0,
    history: (subRow.historyJson ?? []) as WorkflowTransition[],
    createdAt: subRow.createdAt,
    submittedAt: subRow.submittedAt,
  };

  return {
    token: tokenRow.token,
    role: tokenRow.role as SubmissionTokenRole,
    submission,
    agreement,
  };
}
