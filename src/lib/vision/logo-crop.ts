import "server-only";
import sharp from "sharp";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL } from "./client";
import { getStorage } from "@/lib/storage";
import type { ExtractInput } from "./extract";

/**
 * Phase D.1 — Logo extraction.
 *
 * Two-step pipeline:
 *   1. Ask Opus for the bounding box of the document's logo in normalized
 *      0..1 coordinates.
 *   2. Crop that region from the source image with sharp; store at
 *      agreements/{id}/logo.png.
 *
 * Soft-fails if the bounding-box call returns nothing valid or the crop
 * comes out degenerate (zero-size, all-background). Returns the storage
 * key on success or null on soft-fail.
 */

const LOGO_BBOX_TOOL: Anthropic.Tool = {
  name: "report_logo_bbox",
  description:
    "Report the bounding box of the company / organization logo in the document. Coordinates are normalized 0..1 within the page (x=left edge, y=top edge, w=width, h=height). Page is 1-indexed. If no logo is visible, set logoFound to false.",
  input_schema: {
    type: "object",
    required: ["logoFound"],
    properties: {
      logoFound: { type: "boolean" },
      page: { type: "integer", minimum: 1 },
      x: { type: "number", minimum: 0, maximum: 1 },
      y: { type: "number", minimum: 0, maximum: 1 },
      w: { type: "number", minimum: 0, maximum: 1 },
      h: { type: "number", minimum: 0, maximum: 1 },
    },
  },
};

interface LogoBBox {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

async function findLogoBBox(source: ExtractInput): Promise<LogoBBox | null> {
  const client = getAnthropic();
  const contentBlocks: Anthropic.ContentBlockParam[] = [];

  if (source.kind === "image") {
    const total = source.pages.length;
    source.pages.forEach((page, i) => {
      if (total > 1) {
        contentBlocks.push({
          type: "text",
          text: `Page ${i + 1} of ${total}:`,
        });
      }
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: page.mediaType as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: page.data.toString("base64"),
        },
      });
    });
  } else {
    contentBlocks.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: source.data.toString("base64"),
      },
    });
  }

  contentBlocks.push({
    type: "text",
    text: "Locate the document's primary logo (company or organization mark, typically in the header). Report its bounding box via the report_logo_bbox tool. If you cannot identify a clear logo, set logoFound: false.",
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    tools: [LOGO_BBOX_TOOL],
    tool_choice: { type: "tool", name: LOGO_BBOX_TOOL.name },
    messages: [{ role: "user", content: contentBlocks }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) return null;

  const result = toolUse.input as {
    logoFound?: boolean;
    page?: number;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  };

  if (!result.logoFound) return null;
  if (
    typeof result.page !== "number" ||
    typeof result.x !== "number" ||
    typeof result.y !== "number" ||
    typeof result.w !== "number" ||
    typeof result.h !== "number"
  ) {
    return null;
  }

  // Reject degenerate bboxes that would produce a useless crop.
  if (result.w < 0.02 || result.h < 0.01) return null;

  return {
    page: result.page,
    x: clamp01(result.x),
    y: clamp01(result.y),
    w: clamp01(result.w),
    h: clamp01(result.h),
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Crop the given bbox out of the page image and persist it at
 * agreements/{agreementId}/logo.png. Returns the storage key on success.
 */
async function cropAndStoreLogo(
  agreementId: string,
  pageImage: Buffer,
  bbox: LogoBBox,
): Promise<string> {
  const meta = await sharp(pageImage).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width === 0 || height === 0) {
    throw new Error("Source page image has unknown dimensions; cannot crop logo");
  }

  const left = Math.max(0, Math.floor(bbox.x * width));
  const top = Math.max(0, Math.floor(bbox.y * height));
  const cropWidth = Math.min(width - left, Math.max(1, Math.floor(bbox.w * width)));
  const cropHeight = Math.min(height - top, Math.max(1, Math.floor(bbox.h * height)));

  if (cropWidth < 8 || cropHeight < 8) {
    throw new Error(
      `Logo crop too small (${cropWidth}x${cropHeight}px); rejecting`,
    );
  }

  const cropped = await sharp(pageImage)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  const storage = getStorage();
  const key = `agreements/${agreementId}/logo.png`;
  await storage.put(key, cropped);
  return key;
}

/**
 * End-to-end logo extraction. Soft-fails (returns null) if any step fails;
 * the caller persists logoPath as null and the template renders without a
 * logo. Logging is left to the caller.
 */
export async function extractLogo(
  agreementId: string,
  source: ExtractInput,
): Promise<string | null> {
  const bbox = await findLogoBBox(source);
  if (!bbox) return null;

  // Pick the source image for the bbox's page. PDFs aren't easily croppable
  // here without rasterizing — for D.1 we only run the crop pipeline on
  // image sources. PDF logos go un-extracted and the template renders
  // without the embedded image (header text + palette still convey brand).
  if (source.kind !== "image") return null;
  const pageIndex = bbox.page - 1;
  const page = source.pages[pageIndex];
  if (!page) return null;

  try {
    return await cropAndStoreLogo(agreementId, page.data, bbox);
  } catch {
    return null;
  }
}
