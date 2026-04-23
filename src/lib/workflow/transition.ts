import type {
  WorkflowStep,
  WorkflowTransition,
} from "./types";
import { WORKFLOW_COMPLETE } from "./types";

export interface TransitionCheckResult {
  ok: boolean;
  missingFieldIds: string[];
  missingSignatureBlockIds: string[];
}

/**
 * Given the current step's requirements and the submission's data map,
 * report whether all required fields/signatures are present. `data` should
 * be the flat key-value map used in submissions (grouped-field names use
 * the `{groupId}__{instance}__{fieldId}` composite form).
 */
export function canTransition(
  step: WorkflowStep,
  data: Record<string, unknown>,
  signedSignatureBlockIds: string[] = [],
): TransitionCheckResult {
  const missingFieldIds = step.requiredFieldIds.filter((id) => {
    const v = data[id];
    if (v === undefined || v === null) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (typeof v === "boolean" && v === false) return true;
    return false;
  });

  const signedSet = new Set(signedSignatureBlockIds);
  const missingSignatureBlockIds = step.requiredSignatureBlockIds.filter(
    (id) => !signedSet.has(id),
  );

  return {
    ok: missingFieldIds.length === 0 && missingSignatureBlockIds.length === 0,
    missingFieldIds,
    missingSignatureBlockIds,
  };
}

/**
 * Produce the next currentStepIndex + transition record when advancing from
 * `currentStepIndex` through `steps`. Returns WORKFLOW_COMPLETE when there
 * are no more steps.
 */
export function advanceStep(
  currentStepIndex: number,
  steps: WorkflowStep[],
  actor?: string,
  notes?: string,
): { nextStepIndex: number; transition: WorkflowTransition } {
  const now = new Date().toISOString();
  const nextIndex = currentStepIndex + 1;
  const isComplete = nextIndex >= steps.length;
  return {
    nextStepIndex: isComplete ? WORKFLOW_COMPLETE : nextIndex,
    transition: {
      fromStepIndex: currentStepIndex,
      toStepIndex: isComplete ? WORKFLOW_COMPLETE : nextIndex,
      action: isComplete ? "complete" : "advance",
      actor,
      notes,
      at: now,
    },
  };
}

/**
 * Build the initial "start" transition for a brand-new submission. Called
 * once at submission creation to seed `history` with the entry point.
 */
export function startTransition(actor?: string): WorkflowTransition {
  return {
    fromStepIndex: null,
    toStepIndex: 0,
    action: "start",
    actor,
    at: new Date().toISOString(),
  };
}

/**
 * Rework: send the submission back to an earlier step. Caller provides the
 * target step index and optional rationale. Does not itself mutate the
 * submission; just returns the transition to append.
 */
export function reworkTransition(
  fromStepIndex: number,
  toStepIndex: number,
  actor?: string,
  notes?: string,
): WorkflowTransition {
  return {
    fromStepIndex,
    toStepIndex,
    action: "rework",
    actor,
    notes,
    at: new Date().toISOString(),
  };
}
