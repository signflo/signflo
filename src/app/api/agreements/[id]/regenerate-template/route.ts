import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { getAgreementById } from "@/lib/db/queries";
import { generateAgreementTemplate } from "@/lib/vision/template";
import { extractLogo } from "@/lib/vision/logo-crop";
import type { ExtractInput, ImagePage } from "@/lib/vision/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Phase D.1 — POST endpoint that re-runs the template generation pass for
 * an existing agreement. Used by the preview page's Retry button when the
 * initial soft-fail leaves template_html NULL, and as a "regenerate" action
 * when David wants to iterate the prompt and re-run on a stored agreement
 * without re-uploading.
 *
 * Re-loads the source from storage, re-runs Opus, updates the row in place.
 * Soft-fails on logo crop (template generation success is the gate).
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const started = Date.now();
  const { id } = await params;

  try {
    const agreement = await getAgreementById(id);
    if (!agreement) {
      return Response.json({ ok: false, error: "Agreement not found" }, { status: 404 });
    }
    if (!agreement.styleFingerprint) {
      return Response.json(
        { ok: false, error: "Agreement is missing styleFingerprint; cannot regenerate template" },
        { status: 422 },
      );
    }

    const extractInput = await reconstructExtractInput(agreement);

    const template = await generateAgreementTemplate(
      agreement.schema,
      agreement.styleFingerprint,
      extractInput,
    );

    // Always re-attempt the logo crop on regenerate. The caller pushed this
    // button because something was wrong — trust the new result fully,
    // including when it's null (self-critique rejected the crop). A missing
    // logo is better than a visibly-wrong one.
    let logoPath: string | null = null;
    if (agreement.styleFingerprint.layout?.logoPresent) {
      try {
        logoPath = await extractLogo(
          agreement.id,
          extractInput,
          agreement.styleFingerprint,
        );
      } catch (logoErr) {
        console.error(
          "[api/agreements/regenerate-template] logo extraction soft-failed:",
          logoErr,
        );
      }
    }

    const db = getDb();
    await db
      .update(schema.agreements)
      .set({
        templateHtml: template.templateHtml,
        templateCss: template.templateCss,
        fontImportsJson: template.fontImports,
        logoPath,
      })
      .where(eq(schema.agreements.id, agreement.id));

    return Response.json({
      ok: true,
      agreementId: agreement.id,
      logoExtracted: logoPath !== null,
      elapsedMs: Date.now() - started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/agreements/regenerate-template] error:", err);
    return Response.json(
      { ok: false, error: message, elapsedMs: Date.now() - started },
      { status: 500 },
    );
  }
}

async function reconstructExtractInput(agreement: {
  sourceKind: "image" | "pdf";
  sourcePaths: string[];
}): Promise<ExtractInput> {
  const storage = getStorage();

  if (agreement.sourceKind === "pdf") {
    const data = await storage.get(agreement.sourcePaths[0]);
    return {
      kind: "pdf",
      mediaType: "application/pdf",
      data,
    };
  }

  const pages: ImagePage[] = [];
  for (const path of agreement.sourcePaths) {
    const data = await storage.get(path);
    const mediaType = mediaTypeFromPath(path);
    pages.push({ data, mediaType });
  }
  return { kind: "image", pages };
}

function mediaTypeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}
