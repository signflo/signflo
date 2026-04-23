import type { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { getAgreementById } from "@/lib/db/queries";
import { getStorage } from "@/lib/storage";
import { schemaToZod } from "@/lib/form/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE_PREFIX = "files:";

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
    const data: Record<string, unknown> = {};

    for (const field of agreement.schema.fields) {
      if (field.type === "file") {
        const file = formData.get(`${FILE_PREFIX}${field.id}`);
        if (file instanceof File && file.size > 0) {
          const ext = file.name.split(".").pop() ?? "bin";
          const key = `submissions/${submissionId}/${field.id}.${ext}`;
          const buf = Buffer.from(await file.arrayBuffer());
          await storage.put(key, buf);
          data[field.id] = { key, name: file.name, size: file.size, type: file.type };
        } else {
          data[field.id] = null;
        }
        continue;
      }

      const raw = formData.get(field.id);
      if (field.type === "checkbox") {
        data[field.id] = raw === "true";
      } else if (typeof raw === "string") {
        data[field.id] = raw;
      } else {
        data[field.id] = null;
      }
    }

    // Validate what we collected against the derived Zod schema (non-file fields).
    // FormData.get returns null for absent fields; we normalize null → empty
    // string/false so optional-field validators (which accept "" or false) pass
    // cleanly. Required fields still fail on empty via min(1, "Required").
    const zodSchema = schemaToZod(agreement.schema);
    const validatable: Record<string, unknown> = {};
    for (const field of agreement.schema.fields) {
      if (field.type === "file") continue;
      const value = data[field.id];
      if (value === null || value === undefined) {
        validatable[field.id] = field.type === "checkbox" ? false : "";
      } else {
        validatable[field.id] = value;
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
