import { z } from "zod";
import type { AgreementField, AgreementSchema } from "@/lib/vision/types";

/** Shared: build the flat form-field name for a field inside a group instance. */
export function groupFieldName(groupId: string, instance: number, fieldId: string) {
  return `${groupId}__${instance}__${fieldId}`;
}

/**
 * Derive a Zod schema from an AgreementSchema's fields and field groups.
 * Flat submission shape — grouped fields get composite names like
 * `{groupId}__{instance}__{fieldId}`.
 *
 * Strict type coercion + per-type validation. `required` is enforced.
 * File fields are validated as string (the server stores a storage key).
 */
export function schemaToZod(schema: AgreementSchema) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of schema.fields) {
    shape[field.id] = fieldToZod(field);
  }

  for (const group of schema.fieldGroups) {
    for (let i = 0; i < group.initialInstances; i++) {
      for (const field of group.template) {
        // Only the first instance honors `required`; additional instances are
        // optional so users don't have to fill every rendered row.
        const effectiveField: AgreementField =
          i === 0 ? field : { ...field, required: false };
        shape[groupFieldName(group.id, i, field.id)] = fieldToZod(effectiveField);
      }
    }
  }

  return z.object(shape);
}

function fieldToZod(field: AgreementField): z.ZodTypeAny {
  let base: z.ZodTypeAny;

  switch (field.type) {
    case "email":
      base = z.string().trim().email("Enter a valid email address");
      break;
    case "phone":
      base = z
        .string()
        .trim()
        .regex(/^[+\d][\d\s\-().]{6,}$/, "Enter a valid phone number");
      break;
    case "date":
      base = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
      break;
    case "number":
      base = z.coerce.number();
      break;
    case "checkbox":
      base = z.boolean();
      break;
    case "radio":
    case "select":
      base = z.string();
      break;
    case "signature":
    case "initials":
    case "file":
      base = z.string();
      break;
    case "text":
    case "textarea":
    default:
      base = z.string().trim();
      break;
  }

  if (field.required) {
    if (base instanceof z.ZodString) {
      return base.min(1, "Required");
    }
    return base;
  }

  // Optional fields: accept empty string or undefined alongside the base type.
  // Nulls are stripped upstream in the submissions route before validation.
  if (base instanceof z.ZodString) {
    return base.optional().or(z.literal(""));
  }
  return base.optional();
}
