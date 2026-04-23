import type { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { getAgreementById } from "@/lib/db/queries";
import { getStorage } from "@/lib/storage";
import { schemaToZod, groupFieldName } from "@/lib/form/validation";
import type { AgreementField } from "@/lib/vision/types";
import type { Storage as StorageIface } from "@/lib/storage";

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

    if (typeof agreementId !== "string") {
      return Response.json({ error: "Missing agreementId" }, { status: 400 });
    }

    const agreement = await getAgreementById(agreementId);
    if (!agreement) {
      return Response.json({ error: "Agreement not found" }, { status: 404 });
    }

    const submissionId = nanoid();
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

    const now = new Date();
    const db = getDb();
    await db.insert(schema.submissions).values({
      id: submissionId,
      agreementId: agreement.id,
      dataJson: data,
      status: "submitted",
      createdAt: now,
      submittedAt: now,
    });

    return Response.json({
      submissionId,
      submissionShortId: submissionId,
      status: "submitted",
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
