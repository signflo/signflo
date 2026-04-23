# Phase C.2 — Workflow state model decisions

Scope: the data model and API plumbing that lets Signflo agreements move through an ordered sequence of steps (Party A fills → Party B reviews → signed, or the simpler MVP self-sign case). No UI surface beyond a read-only workflow panel in the dev-only compare view.

Each decision below is explicit so future phases can push back when real use cases reveal the wrong call.

---

## 1. Workflow steps are **stored per agreement**, not derived on every read

**Decision:** `agreements.workflow_steps_json` persists an ordered array of `WorkflowStep` at ingest time. Reads return the persisted version as source of truth.

**Alternative considered:** Derive from the schema + signature blocks on every read. No column, no persistence.

**Why store:**
- Custom step sequences (e.g. "co-signer before counterparty" for a specific doc) become possible without changing the derivation logic.
- Audit trail — the step sequence at the time of ingest is preserved even if the agreement schema is later edited (Phase G agentic refinement will let users edit schemas).
- Rework workflows need step-specific metadata (rework notes, per-step required fields) that doesn't belong in the generic schema.

**Pre-migration safety:** rows persisted before this column existed get a fresh derived workflow on every read (via `deriveDefaultWorkflow`). No null-pointer crashes, no migration of existing data required.

**How to override:** drop the column and switch `getAgreementByShortId` to always derive — the derive helper already exists.

---

## 2. Default workflow = one step per non-pre-signed signerRole group

**Decision:** `deriveDefaultWorkflow(schema)` emits one step per `SignerRole` value present in `signatureBlocks`, in a fixed order: `self` → `co-signer` → `counterparty`. `pre-signed` blocks contribute zero steps because they're already done.

All non-signature fields (flat + grouped) are assigned to the **first** step (usually `self`). That matches the common pattern: the person filling the form fills all the data AND signs first; others just sign.

**Alternative considered:** One step per signature block (more granular). Each block, even multiple self blocks, would get its own step.

**Why role-grouped:** multiple `self` blocks on the same document (an agreement with two self signatures, e.g. initial acknowledgement + final sign) are one logical step for the same person, not two. Role grouping matches the intuitive sequence without forcing the signer to submit twice.

**How to override:** edit the persisted `workflowStepsJson` directly. The API has no UI for this yet (Phase G stretch).

---

## 3. `SignerRole` extended to include `co-signer`; `WorkflowRole` is a superset

**Decision:** `SignerRole = "self" | "co-signer" | "counterparty" | "pre-signed"`. A separate `WorkflowRole` type exists that adds `"approver" | "reviewer" | "witness"` for step roles that aren't signature-block roles (e.g. a legal-review approval step that doesn't itself capture a signature).

**Why two types:** the four `SignerRole` values are grounded in visible signature blocks on the source document. The extended `WorkflowRole` values describe steps that could exist in a workflow but have no signature-block analog — reserved for future use when workflows are manually edited.

**How to override:** unify the types if the extras never materialize.

---

## 4. Submissions **always persist if Zod-valid**, even when the step can't advance

**Decision:** `/api/submissions` accepts the submission and stores it with `status = "submitted"` as long as field-level validation passes. Workflow advancement is a separate check: `canTransition` runs AFTER persistence. If the current step's required sig blocks aren't signed (normal case before Phase E ships), the submission stays at `currentStepIndex = 0` and the response includes `missingSignatureBlockIds[]`.

**Alternative considered:** Return 422 "Workflow step incomplete" when signatures are pending (the first version of this code did this).

**Why persist-always:** 422 conflates two distinct failures — *"your data is wrong"* (field validation) vs *"you still have work to do"* (workflow progress). The signer needs an accepting acknowledgement + a clear statement of what's left, not a rejection.

**API shape:**
```
{
  submissionId,
  submissionShortId,
  status: "submitted",
  currentStepIndex: number,       // -1 if complete
  isComplete: boolean,
  missingFieldIds: string[],      // usually []
  missingSignatureBlockIds: string[]
}
```

**How to override:** move the canTransition check before persistence and re-add 422 if you need strictness for demo scripting.

---

## 5. Transition history is a flat array, not a graph

**Decision:** `submissions.history_json` is an ordered `WorkflowTransition[]`. Each transition captures `{fromStepIndex, toStepIndex, action, actor, notes, at}`. Rework loops (`action: "rework"`) appear as a transition back to an earlier step; the history remains linear.

**Alternative considered:** A state graph with explicit forks and merges. Future-proofs complex approvals-with-amendments but is overkill for Signflo's domain.

**Why linear:** every real-world agreement-signing process we care about is a linear ordered flow, even when rework happens ("we need Party A to re-fill clause 4"). Rework is just a backward transition, not a graph branch.

**`WORKFLOW_COMPLETE = -1`** sentinel marks the terminal state. When `currentStepIndex === -1`, all steps are done. Chose a sentinel value over a separate `completed` boolean because it makes transitions uniform (the last `advance` just sets toStepIndex to -1).

---

## 6. Pre-migration rows still render cleanly

**Decision:** Agreements persisted before Phase C.2 shipped have no `workflow_steps_json` in their row. On read, `rowToRecord` in `queries.ts` derives a default workflow from the schema so the downstream code path (compare view, any workflow-aware UI later) doesn't have to branch on "does this pre-date workflows?"

Similarly, submissions persisted before Phase C.2 have `current_step_index = 0` (the default) and `history_json = null` (treated as `[]` by queries). They'll never advance automatically — but they won't crash either.

**How to override:** add a one-shot backfill script in `scripts/migrate.ts` that writes derived workflows into pre-existing rows. Not worth the effort for a dev database; would be worth it when we have production data.

---

## What's explicitly NOT in Phase C.2

- No per-step UI beyond the read-only compare-view workflow panel. The form renderer still only renders step 0's fields. Phase D or E adds step navigation.
- No role-aware form rendering. When we get to multi-party workflows, step 0 (self) sees different fields/blocks than step 1 (counterparty). That routing lives in the FormRenderer + a step-aware route.
- No token/auth for step-specific access. URL-as-bearer-token (Phase C.3) provides per-submission access; step-specific access control is a later refinement.
- No explicit "rework" button. The API helper `reworkTransition()` exists and can be called manually; the UI for a reviewer to "send back with notes" ships in Phase E or later.
- No emails or notifications. When a step transitions, no one is told. Phase E or later — probably tied to signing completion.

---

## Open questions for David (when you're reviewing)

- For your church's use case (bulletins, event consent forms), is multi-party workflow ever relevant, or is "Pastor signs → done" always a single self-step? If always single-step, we can deprioritize multi-party UI work indefinitely.
- For PGA TOUR Tour Forms v2 transferability: is the workflow-state model here general enough for your team's use cases, or are there domain specifics (PGA TOUR approval chains, contract routing) that would benefit from a different shape?
- `canTransition` currently treats a boolean field as "filled" only when `true`. Is that right for checkboxes used for acknowledgement (where `true` = acknowledged, `false` = refused), or do we want to allow either state to satisfy the requirement?
