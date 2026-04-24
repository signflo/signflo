import type { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { getAgreementById } from "@/lib/db/queries";
import { getStorage } from "@/lib/storage";
import { schemaToZod, groupFieldName } from "@/lib/form/validation";
import type { AgreementField } from "@/lib/vision/types";
import type { Storage as StorageIface } from "@/lib/storage";
import { canTransition, advanceStep, startTransition } from "@/lib/workflow/transition";
import { WORKFLOW_COMPLETE, type WorkflowTransition } from "@/lib/workflow/types";
import { mintSubmissionToken } from "@/lib/tokens/queries";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE_PREFIX = "files:";

type FieldData =
  | string
  | boolean
  | null
  | { key: string; name: string; size: number; type: string };

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const agreementId = formData.get("agreementId");
    const draftTokenRaw = formData.get("draftToken");
    const draftToken =
      typeof draftTokenRaw === "string" && draftTokenRaw.length > 0 ? draftTokenRaw : null;

    if (typeof agreementId !== "string") {
      return Response.json({ error: "Missing agreementId" }, { status: 400 });
    }

    const agreement = await getAgreementById(agreementId);
    if (!agreement) {
      return Response.json({ error: "Agreement not found" }, { status: 404 });
    }

    // Resolve the submission id — if a draftToken is supplied, update in place
    // (same submission, same token, status transitions draft → submitted).
    // Otherwise mint a fresh submission id.
    const db = getDb();
    let submissionId: string;
    let isResumingDraft = false;
    if (draftToken) {
      const tokenRows = await db
        .select()
        .from(schema.submissionTokens)
        .where(eq(schema.submissionTokens.token, draftToken))
        .limit(1);
      const tokenRow = tokenRows[0];
      if (!tokenRow) {
        return Response.json({ error: "Draft token not found" }, { status: 404 });
      }
      const subRows = await db
        .select()
        .from(schema.submissions)
        .where(eq(schema.submissions.id, tokenRow.submissionId))
        .limit(1);
      const subRow = subRows[0];
      if (!subRow) {
        return Response.json({ error: "Draft submission not found" }, { status: 404 });
      }
      if (subRow.agreementId !== agreement.id) {
        return Response.json(
          { error: "Draft belongs to a different agreement" },
          { status: 400 },
        );
      }
      if (subRow.status !== "draft") {
        return Response.json(
          { error: "Submission is no longer a draft" },
          { status: 409 },
        );
      }
      submissionId = subRow.id;
      isResumingDraft = true;
    } else {
      submissionId = nanoid();
    }

    const storage = getStorage();
    const data: Record<string, FieldData> = {};

    // Flat fields
    for (const field of agreement.schema.fields) {
      data[field.id] = await collectFieldValue(field, field.id, formData, submissionId, storage);
    }

    // Grouped fields — flat submission storage, keyed by composite name
    for (const group of agreement.schema.fieldGroups) {
      for (let i = 0; i < group.initialInstances; i++) {
        for (const field of group.template) {
          const name = groupFieldName(group.id, i, field.id);
          data[name] = await collectFieldValue(field, name, formData, submissionId, storage);
        }
      }
    }

    // Validate against the derived Zod schema (non-file fields).
    // FormData.get returns null for absent fields; we normalize null → empty
    // string/false so optional-field validators pass cleanly. Required fields
    // still fail on empty via min(1, "Required").
    const zodSchema = schemaToZod(agreement.schema);
    const validatable: Record<string, unknown> = {};

    for (const field of agreement.schema.fields) {
      if (field.type === "file") continue;
      validatable[field.id] = normalizeForZod(field, data[field.id]);
    }
    for (const group of agreement.schema.fieldGroups) {
      for (let i = 0; i < group.initialInstances; i++) {
        for (const field of group.template) {
          if (field.type === "file") continue;
          const name = groupFieldName(group.id, i, field.id);
          validatable[name] = normalizeForZod(field, data[name]);
        }
      }
    }

    const parsed = zodSchema.safeParse(validatable);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        fieldErrors[key] = issue.message;
      }
      return Response.json(
        { error: "Validation failed", fieldErrors },
        { status: 422 },
      );
    }

    // Workflow: persist the submission unconditionally (the data is already
    // Zod-valid), then attempt to advance the step. Incomplete signatures
    // keep the submission at the current step — they're not a validation
    // error, just pending work. The API reports what's still needed.
    const steps = agreement.workflowSteps ?? [];
    const history: WorkflowTransition[] = [startTransition()];
    let currentStepIndex = 0;
    let isComplete = false;
    let missingFieldIds: string[] = [];
    let missingSignatureBlockIds: string[] = [];

    if (steps.length > 0) {
      const currentStep = steps[0];
      // Phase C.2 has no signature capture yet — treat sig-block requirements
      // as pending, not failing. Phase E will populate signedBlockIds from
      // captured signatures and this will advance naturally.
      const check = canTransition(currentStep, validatable, /* signed = */ []);
      missingFieldIds = check.missingFieldIds;
      missingSignatureBlockIds = check.missingSignatureBlockIds;

      if (check.ok) {
        const advance = advanceStep(0, steps);
        history.push(advance.transition);
        currentStepIndex = advance.nextStepIndex;
        isComplete = currentStepIndex === WORKFLOW_COMPLETE;
      }
    } else {
      // No workflow defined (legacy / edge case) → treat as complete.
      currentStepIndex = WORKFLOW_COMPLETE;
      isComplete = true;
    }

    const now = new Date();

    if (isResumingDraft && draftToken) {
      // Draft → submitted transition. Reuse the draft row + its existing
      // token. History gets the additional advance / start entries recorded
      // above; we merge with whatever history already existed on the draft.
      const existingRows = await db
        .select()
        .from(schema.submissions)
        .where(eq(schema.submissions.id, submissionId))
        .limit(1);
      const existing = existingRows[0];
      const existingHistory =
        (existing?.historyJson as WorkflowTransition[] | null) ?? [];
      // Drop the "start" entry we built up above since the draft already
      // had one; keep any advance/complete entry we just produced.
      const newEntries = history.filter((h) => h.action !== "start");
      const mergedHistory = [...existingHistory, ...newEntries];

      await db
        .update(schema.submissions)
        .set({
          dataJson: data,
          status: "submitted",
          currentStepIndex,
          historyJson: mergedHistory,
          submittedAt: now,
        })
        .where(eq(schema.submissions.id, submissionId));

      return Response.json({
        submissionId,
        submissionShortId: submissionId,
        status: "submitted",
        currentStepIndex,
        isComplete,
        missingFieldIds,
        missingSignatureBlockIds,
        ownerUrl: `/s/${draftToken}`,
      });
    }

    // Brand-new submission path — insert + mint a fresh token.
    await db.insert(schema.submissions).values({
      id: submissionId,
      agreementId: agreement.id,
      dataJson: data,
      status: "submitted",
      currentStepIndex,
      historyJson: history,
      createdAt: now,
      submittedAt: now,
    });

    // Mint the owner bearer token. This is the ONE time the raw token value
    // is sent over the wire — the client redirects the user to /s/{token}
    // and uses that URL as their ongoing reference.
    const ownerToken = await mintSubmissionToken(submissionId, "owner");

    return Response.json({
      submissionId,
      submissionShortId: submissionId,
      status: "submitted",
      currentStepIndex,
      isComplete,
      missingFieldIds,
      missingSignatureBlockIds,
      ownerUrl: `/s/${ownerToken}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/submissions] error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

async function collectFieldValue(
  field: AgreementField,
  name: string,
  formData: FormData,
  submissionId: string,
  storage: StorageIface,
): Promise<FieldData> {
  if (field.type === "file") {
    const file = formData.get(`${FILE_PREFIX}${name}`);
    if (file instanceof File && file.size > 0) {
      const ext = file.name.split(".").pop() ?? "bin";
      const key = `submissions/${submissionId}/${name}.${ext}`;
      const buf = Buffer.from(await file.arrayBuffer());
      await storage.put(key, buf);
      return { key, name: file.name, size: file.size, type: file.type };
    }
    return null;
  }

  const raw = formData.get(name);
  if (field.type === "checkbox") return raw === "true";
  if (typeof raw === "string") return raw;
  return null;
}

function normalizeForZod(field: AgreementField, value: FieldData): unknown {
  if (value === null || value === undefined) {
    return field.type === "checkbox" ? false : "";
  }
  return value;
}
