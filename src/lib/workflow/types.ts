/**
 * Workflow state model for Signflo agreements.
 *
 * A workflow is an ordered sequence of steps. Each step has a role (who
 * completes it), a set of required fields and signature blocks, and its own
 * optional completion metadata. A submission tracks which step is currently
 * active plus a transition history for auditing.
 *
 * MVP only exercises one-step "self-signing" flows, but the data model is
 * shaped for later multi-party routing (Party A → Party B → signed) and
 * rework loops ("send back to Party A with notes") without migration.
 */

import type { SignerRole } from "@/lib/vision/types";

/** Who performs a given step. Mirrors SignerRole but can extend for approvers/reviewers/witnesses later. */
export type WorkflowRole = SignerRole | "approver" | "reviewer" | "witness";

export interface WorkflowStep {
  /** Stable ID for referencing this step in transitions. */
  id: string;
  /** Human-readable step label, e.g. "Purchaser signs" or "Counterparty review". */
  label: string;
  /** Who completes this step. */
  role: WorkflowRole;
  /** Field IDs that must be filled (non-empty / truthy for checkboxes) to leave this step. */
  requiredFieldIds: string[];
  /** Signature block IDs that must be signed during this step. */
  requiredSignatureBlockIds: string[];
  /** 0-indexed sequence position. */
  order: number;
  /** Optional note surfaced in the UI (e.g. "Please review clause 4 before signing"). */
  notes?: string;
}

/**
 * One entry in a submission's transition history. Records forward progress,
 * rework (going back to an earlier step), or rejection.
 */
export interface WorkflowTransition {
  fromStepIndex: number | null;
  toStepIndex: number | null;
  action: "start" | "advance" | "rework" | "complete" | "reject";
  /** Optional ID or display name of who triggered the transition. */
  actor?: string;
  /** Optional note, e.g. rework rationale. */
  notes?: string;
  at: string; // ISO 8601 timestamp
}

/** Terminal step index when the workflow completes cleanly. */
export const WORKFLOW_COMPLETE = -1;
