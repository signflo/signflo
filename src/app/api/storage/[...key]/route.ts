import type { NextRequest } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve files from LocalStorage. Gated to `sources/` and `submissions/` prefixes so
 * the endpoint can't be used to escape the uploads dir via crafted keys (LocalStorage
 * already strips `..` and leading slashes, but belt-and-suspenders).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string[] }> },
) {
  const { key: parts } = await context.params;
  const key = parts.join("/");

  if (!key.startsWith("sources/") && !key.startsWith("submissions/")) {
    return new Response("Not found", { status: 404 });
  }

  const storage = getStorage();
  if (!(await storage.exists(key))) {
    return new Response("Not found", { status: 404 });
  }

  const buf = await storage.get(key);
  const ext = key.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "pdf"
      ? "application/pdf"
      : ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "heic"
            ? "image/heic"
            : ext === "webp"
              ? "image/webp"
              : "application/octet-stream";

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
