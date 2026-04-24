import type { AgreementField, AgreementSchema, SignerRole } from "@/lib/vision/types";
import type { WorkflowStep, WorkflowRole } from "./types";

/**
 * Generate a sensible default workflow from an AgreementSchema.
 *
 * Rules (Phase C, post-cleanup):
 *  1. The filer (self) ALWAYS gets the first step if there are any fillable
 *     fields — even when the document has no top-level "self" signature
 *     block (e.g. a notarized DBA where the filer signs inside the owners
 *     table FieldGroup, but the only top-level blocks are notary +
 *     county clerk).
 *  2. Each remaining non-pre-signed signerRole present in signatureBlocks
 *     gets one step in the order self → co-signer → counterparty.
 *  3. pre-signed blocks contribute zero steps (already done at ingest).
 *  4. Field assignment follows `field.filledByRole` (default "self") so
 *     notary-, clerk-, or vendor-filled fields land on the correct step
 *     instead of being dumped on step 0.
 */
export function deriveDefaultWorkflow(schema: AgreementSchema): WorkflowStep[] {
  const blocksByRole: Record<SignerRole, typeof schema.signatureBlocks> = {
    self: [],
    "co-signer": [],
    counterparty: [],
    "pre-signed": [],
  };
  for (const block of schema.signatureBlocks) {
    const role = (block.signerRole ?? "self") as SignerRole;
    blocksByRole[role].push(block);
  }

  // Determine which role steps to emit. Self is forced if there are any
  // fillable fields, even without a self signature block.
  const hasFillableFields =
    schema.fields.length > 0 || schema.fieldGroups.length > 0;
  const orderedRoles: SignerRole[] = [];

  if (blocksByRole.self.length > 0 || hasFillableFields) {
    orderedRoles.push("self");
  }
  if (blocksByRole["co-signer"].length > 0) orderedRoles.push("co-signer");
  if (blocksByRole.counterparty.length > 0) orderedRoles.push("counterparty");

  // Edge case: no fields and no non-pre-signed blocks. Fall back to a
  // single self step so every agreement has at least one workflow step.
  if (orderedRoles.length === 0) {
    return [
      {
        id: "step-self",
        label: "Fill and sign",
        role: "self",
        requiredFieldIds: [],
        requiredSignatureBlockIds: [],
        order: 0,
      },
    ];
  }

  // Group fields by their filledByRole. Defaults to "self" when unset.
  // Grouped-instance fields inherit the filledByRole of their template.
  const fieldsByRole: Record<SignerRole, string[]> = {
    self: [],
    "co-signer": [],
    counterparty: [],
    "pre-signed": [],
  };
  for (const f of schema.fields) {
    const role = (f.filledByRole ?? "self") as SignerRole;
    fieldsByRole[role].push(f.id);
  }
  for (const group of schema.fieldGroups) {
    for (let i = 0; i < group.initialInstances; i++) {
      for (const f of group.template) {
        const role = (f.filledByRole ?? "self") as SignerRole;
        fieldsByRole[role].push(`${group.id}__${i}__${f.id}`);
      }
    }
  }

  const steps: WorkflowStep[] = orderedRoles.map((role, i) => ({
    id: `step-${role}`,
    label: stepLabel(role),
    role: role as WorkflowRole,
    // If a field's filledByRole is set to a role that has no step (e.g.
    // pre-signed but we didn't emit a pre-signed step), fall it back to
    // self so it's still routed somewhere.
    requiredFieldIds: fieldsByRole[role] ?? [],
    requiredSignatureBlockIds: blocksByRole[role].map((b) => b.id),
    order: i,
  }));

  // Re-route pre-signed and unrouteable fields to the first step (usually
  // self) so the form still asks for them — pre-signed metadata is for
  // signature blocks; pre-signed FIELDS are rare but should default
  // somewhere visible if they exist.
  if (fieldsByRole["pre-signed"].length > 0 && steps.length > 0) {
    steps[0].requiredFieldIds = [
      ...steps[0].requiredFieldIds,
      ...fieldsByRole["pre-signed"],
    ];
  }

  return steps;
}

function stepLabel(role: SignerRole): string {
  switch (role) {
    case "self":
      return "You fill and sign";
    case "co-signer":
      return "Co-signer signs";
    case "counterparty":
      return "Counterparty reviews and signs";
    case "pre-signed":
      return "Already signed";
  }
}
