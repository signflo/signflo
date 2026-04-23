import type { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { extractAgreement, type ExtractInput } from "@/lib/vision/extract";
import { verifyExtraction } from "@/lib/vision/verify";
import { extractPdfText } from "@/lib/pdf/ingest";
import { deriveDefaultWorkflow } from "@/lib/workflow/derive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const ACCEPTED_PDF_TYPE = "application/pdf";

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "No file uploaded (expect multipart field 'file')" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const data = Buffer.from(arrayBuffer);
    let mediaType = file.type || "application/octet-stream";

    // HEIC images often arrive without a type set by the browser; trust the extension as fallback.
    if (!mediaType || mediaType === "application/octet-stream") {
      const name = file.name?.toLowerCase() ?? "";
      if (name.endsWith(".heic")) mediaType = "image/heic";
      else if (name.endsWith(".heif")) mediaType = "image/heif";
      else if (name.endsWith(".pdf")) mediaType = "application/pdf";
      else if (name.endsWith(".png")) mediaType = "image/png";
      else if (name.endsWith(".jpg") || name.endsWith(".jpeg")) mediaType = "image/jpeg";
    }

    const isPdf = mediaType === ACCEPTED_PDF_TYPE;
    const isImage = ACCEPTED_IMAGE_TYPES.has(mediaType);

    if (!isPdf && !isImage) {
      return Response.json(
        { error: `Unsupported file type: ${mediaType}. Accepted: images (jpg/png/heic) and application/pdf.` },
        { status: 415 },
      );
    }

    const agreementId = nanoid();
    const shortId = nanoid(10);

    const storage = getStorage();
    const ext = isPdf ? "pdf" : mediaType.split("/")[1] ?? "bin";
    const sourceKey = `sources/${agreementId}.${ext}`;
    await storage.put(sourceKey, data);

    // Digital-PDF text layer (best-effort enrichment)
    let textLayer: string | undefined;
    if (isPdf) {
      const text = await extractPdfText(data);
      if (text) textLayer = text;
    }

    // Vision: first extraction
    const extractInput: ExtractInput = isPdf
      ? { kind: "pdf", mediaType: ACCEPTED_PDF_TYPE, data, textLayer }
      : { kind: "image", mediaType, data };

    const firstPass = await extractAgreement(extractInput);
    const verified = await verifyExtraction(extractInput, firstPass);

    const workflowSteps = deriveDefaultWorkflow(verified.schema);

    const db = getDb();
    await db.insert(schema.agreements).values({
      id: agreementId,
      shortId,
      title: verified.schema.title || "Untitled agreement",
      sourceKind: isPdf ? "pdf" : "image",
      sourcePath: sourceKey,
      schemaJson: verified.schema,
      styleFingerprintJson: verified.styleFingerprint,
      lowConfidenceFieldsJson: verified.lowConfidenceFieldIds,
      workflowStepsJson: workflowSteps,
      createdAt: new Date(),
    });

    return Response.json({
      agreementId,
      shortId,
      schema: verified.schema,
      styleFingerprint: verified.styleFingerprint,
      lowConfidenceFieldIds: verified.lowConfidenceFieldIds,
      workflowSteps,
      elapsedMs: Date.now() - started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ingest] error:", err);
    return Response.json({ error: message, elapsedMs: Date.now() - started }, { status: 500 });
  }
}
