import type { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getAgreementById } from "@/lib/db/queries";
import { mintSubmissionToken } from "@/lib/tokens/queries";
import { startTransition } from "@/lib/workflow/transition";
import type { WorkflowTransition } from "@/lib/workflow/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upsert a draft submission.
 *
 * Request body (JSON): { agreementId, draftToken?, data }
 * - `draftToken` absent → create a new draft submission, mint an owner
 *   token, return the new draftToken + ownerUrl.
 * - `draftToken` present → look up by token, verify it's a draft (not a
 *   submitted submission), update dataJson, return the same draftToken.
 *
 * No Zod validation — drafts are explicitly allowed to be invalid or
 * incomplete. No workflow transition — drafts always sit at step 0.
 * File uploads skipped — drafts save partial text state only; file inputs
 * are only durably stored when the user finalizes the submission.
 */
interface DraftPayload {
  agreementId: string;
  draftToken?: string;
  data?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DraftPayload;
    const agreementId = body.agreementId;
    const data = body.data ?? {};

    if (typeof agreementId !== "string" || agreementId.length === 0) {
      return Response.json({ error: "Missing agreementId" }, { status: 400 });
    }

    const agreement = await getAgreementById(agreementId);
    if (!agreement) {
      return Response.json({ error: "Agreement not found" }, { status: 404 });
    }

    const db = getDb();
    const now = new Date();

    // Resume path — token supplied, update existing draft.
    if (body.draftToken) {
      const tokenRows = await db
        .select()
        .from(schema.submissionTokens)
        .where(eq(schema.submissionTokens.token, body.draftToken))
        .limit(1);
      const tokenRow = tokenRows[0];
      if (!tokenRow) {
        return Response.json({ error: "Token not found" }, { status: 404 });
      }

      const subRows = await db
        .select()
        .from(schema.submissions)
        .where(eq(schema.submissions.id, tokenRow.submissionId))
        .limit(1);
      const subRow = subRows[0];
      if (!subRow) {
        return Response.json({ error: "Draft not found" }, { status: 404 });
      }
      if (subRow.status !== "draft") {
        return Response.json(
          { error: "Submission is no longer a draft" },
          { status: 409 },
        );
      }
      if (subRow.agreementId !== agreement.id) {
        return Response.json(
          { error: "Draft belongs to a different agreement" },
          { status: 400 },
        );
      }

      await db
        .update(schema.submissions)
        .set({ dataJson: data })
        .where(eq(schema.submissions.id, subRow.id));

      return Response.json({
        draftToken: body.draftToken,
        ownerUrl: `/s/${body.draftToken}`,
        savedAt: now.toISOString(),
      });
    }

    // First-save path — create a fresh draft row + mint owner token.
    const submissionId = nanoid();
    const history: WorkflowTransition[] = [startTransition()];

    await db.insert(schema.submissions).values({
      id: submissionId,
      agreementId: agreement.id,
      dataJson: data,
      status: "draft",
      currentStepIndex: 0,
      historyJson: history,
      createdAt: now,
      submittedAt: null,
    });

    const ownerToken = await mintSubmissionToken(submissionId, "owner");

    return Response.json({
      draftToken: ownerToken,
      ownerUrl: `/s/${ownerToken}`,
      savedAt: now.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/drafts] error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
