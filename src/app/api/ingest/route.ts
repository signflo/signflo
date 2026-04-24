import type { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { extractAgreement, type ExtractInput, type ImagePage } from "@/lib/vision/extract";
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

interface NormalizedFile {
  data: Buffer;
  mediaType: string;
  isPdf: boolean;
  isImage: boolean;
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const formData = await request.formData();
    // Accept either `file` (singular, legacy) or `files` (multiple, new).
    const rawFiles: File[] = [
      ...formData.getAll("files"),
      ...formData.getAll("file"),
    ].filter((v): v is File => v instanceof File && v.size > 0);

    if (rawFiles.length === 0) {
      return Response.json(
        { error: "No file uploaded (expect multipart field 'file' or 'files')" },
        { status: 400 },
      );
    }

    const normalized: NormalizedFile[] = [];
    for (const f of rawFiles) {
      const buf = Buffer.from(await f.arrayBuffer());
      let mediaType = f.type || "application/octet-stream";
      if (!mediaType || mediaType === "application/octet-stream") {
        const name = f.name?.toLowerCase() ?? "";
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
      normalized.push({ data: buf, mediaType, isPdf, isImage });
    }

    // Multi-page rules: PDFs must be solo (a PDF is its own multi-page entity);
    // images can be 1..N pages of one logical agreement.
    const hasPdf = normalized.some((f) => f.isPdf);
    if (hasPdf && normalized.length > 1) {
      return Response.json(
        {
          error:
            "PDFs are inherently multi-page — please upload a single PDF, not a PDF combined with other files.",
        },
        { status: 400 },
      );
    }

    const agreementId = nanoid();
    const shortId = nanoid(10);
    const storage = getStorage();
    const sourcePaths: string[] = [];
    let textLayer: string | undefined;
    let extractInput: ExtractInput;

    if (hasPdf) {
      // Single-PDF path. Stored at the legacy single-source location.
      const pdfFile = normalized[0];
      const sourceKey = `sources/${agreementId}.pdf`;
      await storage.put(sourceKey, pdfFile.data);
      sourcePaths.push(sourceKey);

      const text = await extractPdfText(pdfFile.data);
      if (text) textLayer = text;

      extractInput = {
        kind: "pdf",
        mediaType: ACCEPTED_PDF_TYPE,
        data: pdfFile.data,
        textLayer,
      };
    } else {
      // 1..N image pages. Always stored under sources/{agreementId}/page-{N}.{ext}
      // even when N=1 — keeps the path scheme uniform for new uploads.
      const pages: ImagePage[] = [];
      for (let i = 0; i < normalized.length; i++) {
        const f = normalized[i];
        const ext = f.mediaType.split("/")[1] ?? "bin";
        const key = `sources/${agreementId}/page-${i + 1}.${ext}`;
        await storage.put(key, f.data);
        sourcePaths.push(key);
        pages.push({ mediaType: f.mediaType, data: f.data });
      }
      extractInput = { kind: "image", pages };
    }

    const firstPass = await extractAgreement(extractInput);
    const verified = await verifyExtraction(extractInput, firstPass);
    const workflowSteps = deriveDefaultWorkflow(verified.schema);

    const db = getDb();
    await db.insert(schema.agreements).values({
      id: agreementId,
      shortId,
      title: verified.schema.title || "Untitled agreement",
      sourceKind: hasPdf ? "pdf" : "image",
      sourcePath: sourcePaths[0],
      sourcePathsJson: sourcePaths,
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
      sourcePaths,
      pageCount: sourcePaths.length,
      elapsedMs: Date.now() - started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ingest] error:", err);
    return Response.json({ error: message, elapsedMs: Date.now() - started }, { status: 500 });
  }
}
