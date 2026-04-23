import { z } from "zod";
import type { AgreementField, AgreementSchema } from "@/lib/vision/types";

/**
 * Derive a Zod schema from an AgreementSchema's fields.
 * Strict type coercion + per-type validation. `required` is enforced.
 * File fields are validated as string (the server stores a storage key).
 */
export function schemaToZod(schema: AgreementSchema) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of schema.fields) {
    shape[field.id] = fieldToZod(field);
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
