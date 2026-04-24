# Phase C cleanup PR #9 — multi-page ingestion + camera UX

Closes validation-log issues #5 (multi-page / multi-image ingestion) and #6 (dedicated "Take Photo" button + multi-photo session). David raised both during the 4-document validation pass — a real-world agreement engine should handle "I photographed all 5 pages of my lease" without requiring the user to invent some other workflow.

---

## 1. PDF-solo vs. N-image rule

**Decision:** A single agreement can be ingested as either ONE PDF or N images (1..N). PDFs combined with anything else are rejected with HTTP 400.

**Why:** PDFs are inherently multi-page entities — Opus 4.7 reads them natively as a single document with multiple pages. Mixing a PDF with image pages would create ambiguous semantics ("are the images more pages of the PDF? a different document?"). The clean rule is: if any uploaded file is a PDF, it must be the only file.

**Behavior:**
- 1 PDF → single-document upload, stored at `sources/{agreementId}.pdf`
- 1..N images → multi-page upload, stored at `sources/{agreementId}/page-{N}.{ext}`
- 1+ PDFs OR PDF+image mix → 400 error with explanation

---

## 2. Storage path scheme: subdirectory for multi-page, flat for PDF

**Decision:**
- Single PDF: `sources/{agreementId}.pdf` (existing convention)
- 1..N images: `sources/{agreementId}/page-{N}.{ext}` (new pattern, even when N=1)

**Why per-agreement subdirectory for images:**
- Listing the pages of an agreement is a single `ls` against a single directory
- Page ordering is preserved by the filename suffix
- No `agreements/{id}/page-1.jpeg` naming collisions across agreements
- Future cleanup ("delete this agreement's storage") is one rmdir

**Why preserve the flat `sources/{id}.pdf` for PDFs:**
- PDFs are atomic; a per-PDF subdirectory adds no value
- Backwards compat — existing single-PDF rows already use this path

The `/api/storage/[...key]` route already serves arbitrary paths under `sources/`, so no route changes were needed.

---

## 3. DB schema: additive `source_paths_json`, keep `source_path` for compat

**Decision:** Add a new `source_paths_json` (TEXT JSON, nullable) column that stores the ordered array of all source paths. Keep the existing `source_path` (TEXT, NOT NULL) column populated with the first page's path for backwards compat with any code that still reads it.

**Read shim in `queries.ts`:** prefer `source_paths_json` when present; fall back to wrapping `source_path` as a single-element array. Result: every consumer reads `agreement.sourcePaths: string[]` regardless of when the row was created.

**Why not drop `source_path`:** zero-downtime migrations. If a future build accidentally reads `source_path` on a row that has only `source_paths_json`, dropping the column would crash. Keeping both populated costs ~32 bytes per row and eliminates that class of regression.

**When to clean up:** once we're confident every reader uses `agreement.sourcePaths`, a follow-up migration can drop `source_path`. Not urgent.

---

## 4. Vision pipeline: N image content blocks + page-numbering hints

**Decision:** `ExtractInput` is now a discriminated union — `{ kind: "image"; pages: ImagePage[] }` for 1..N images, `{ kind: "pdf"; ... }` for a single PDF. The image path always uses an array, even when N=1.

For multi-page image input, the pipeline:
1. Prepends a text block: *"This document has N pages photographed separately. Treat them as one continuous agreement; pages are presented in order."*
2. For each page, prepends `"Page X of N:"` then the image content block.

**Why explicit page numbering in the prompt:** Opus needs to know that the pages are sequential parts of one document, not unrelated images. Without this hint, the model could produce N independent extractions and try to merge them awkwardly. The numbering also lets the model use cross-page references in `workflowHints` (e.g. *"Page 2's terms reference page 1's clause 4"*).

**PDF path is unchanged.** PDFs ride a single `document` content block — Opus handles their multi-page-ness natively.

---

## 5. Ingest UI: drop zone + Choose Files + Take Photo, with thumbnails

**Decision:** Three input affordances, all routed to the same multi-file accumulator:

- **Drop zone** (large, full-width) — accepts drag-drop OR click-to-pick; `multiple` enabled. Default surface for desktop and "tap to pick from camera roll" on mobile.
- **Choose files button** (small, below) — direct picker, mirrors the drop zone's input. Useful when the drop zone is blocked by some browser file-handler oddity.
- **Take Photo button** (small, below) — separate `<input type="file" capture="environment">` with `accept="image/*"` and NO `multiple`. On iOS Safari this directly opens the rear camera; the user takes one photo and it gets added to the page list. To take another, they tap "Take Photo" again.

**Why the Take Photo button uses single-shot (not `multiple`):** iOS Safari's multi-photo camera session behavior is unreliable across browser versions — some show a "take more / done" UI, some return after one shot. The single-shot approach is consistent: take a page, see it land in the list, tap to take another. No surprises.

Page list renders as ordered thumbnails (image previews for images, "PDF" placeholder for PDFs). Each has a remove button (`✕`). Total file size is shown above the list.

**Mixing rule enforced client-side too:** if the user already added a PDF, attempting to add an image (or vice versa) triggers an inline error before the request fires. The server rejects too as a defense in depth.

---

## 6. No client-side PDF stitching of images

**Decision:** Multi-image uploads stay as individual images; we do NOT stitch them into a single PDF in the browser before upload.

**Alternative considered:** Use `pdf-lib` or similar to combine N images into a single PDF on the client, then upload that PDF. Server-side ingestion stays simple (one path).

**Why not:**
- Adds a heavy client-side dependency for a server-side simplification we don't need (the server handles multi-image just fine)
- Loses per-image fidelity (PDF compression vs. original JPEG)
- Loses the per-page positioning hints Opus might extract from individual images
- Slower client UX (large client-side encoding before upload starts)

The clean separation: client uploads what the user picked; server orchestrates the multi-page semantics. Same model as Google Drive uploading folder contents — files go up individually, the server handles the "they're related" semantics.

---

## 7. Backwards compat: pre-migration agreements still work

**Decision:** Every Phase A/B/C agreement created before this PR has only `source_path` (no `source_paths_json`). Validated:

- `/a/{shortId}` for pre-migration agreements still loads (200) — `queries.ts` shim wraps `sourcePath` as `[sourcePath]`
- `/a/{shortId}/compare` renders the single page (the iteration over `sourcePaths` produces one row)
- `/api/submissions` and `/s/{token}` paths unchanged — they don't care about source paths

No backfill needed. New uploads populate both columns; old uploads fall through the shim.

---

## What's explicitly NOT in this PR

- **Drag-to-reorder pages.** MVP relies on selection order. Reordering is a polish item — for users who need it, "Clear all" + re-pick is the workaround.
- **Per-page rotation correction.** Opus already auto-rotates internally when its vision sees an upside-down image (it told us so on the Phase A stress test). If this becomes an issue, server-side `sharp`-based auto-rotate is a follow-up.
- **Page count limit.** No upper bound enforced. A 50-page upload would just be slow + expensive on the Opus side. We can add `MAX_PAGES_PER_INGEST` if abuse becomes a concern.
- **Compressed multi-image upload.** Each page is uploaded as-is. For large originals, client-side resize is a polish item — not blocking.
- **OCR confidence per page.** Opus reports field-level confidence; we don't break it down by source page yet. The compare view's page-by-page display lets a human do it visually.

---

## Open questions for David

- iOS Safari "Take Photo" experience — when you test, does the single-shot capture flow feel right, or do you want me to try the `multiple` attribute on the capture input despite the cross-version inconsistency?
- Page count limit — do you want a sensible cap (say, 20 pages) to prevent runaway costs, or trust the user not to dump entire books?
- The `sources/{id}/page-N.ext` directory pattern means a single agreement's pages live together. Worth noting if/when we move to R2 (Cloudflare), where prefix-based key listing is cheap.
