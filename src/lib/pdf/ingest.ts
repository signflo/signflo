import "server-only";

/**
 * Extract the native text layer from a digital PDF using pdfjs-dist.
 * Returns plain text or `null` if extraction fails (e.g. scan with no text layer).
 *
 * We don't rasterize the PDF to images here — Opus 4.7 accepts PDFs natively
 * as document content blocks and does its own layout-aware reading.
 */
export async function extractPdfText(data: Buffer): Promise<string | null> {
  try {
    // Legacy ESM build avoids DOM dependencies when running in Node.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const strings = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean);
      pages.push(strings.join(" "));
    }

    const joined = pages.join("\n\n---\n\n").trim();
    return joined.length > 0 ? joined : null;
  } catch (err) {
    console.warn("[pdf/ingest] text extraction failed:", err);
    return null;
  }
}
