# Phase D.1 — Rendering contract + Service Contract spike

**Status:** in progress
**Branch:** `phase-d/d1-rendering-contract`
**Sub-phase of:** Phase D — Rendering + style-matched form UI + high-fidelity PDF (see `docs/roadmap.md`)

## Goal

Round-trip ONE document — the Service Contract PDF (`N-DvD6gFJN`) — through ingest → HTML template generation → in-browser preview that passes David's eye-test against the original. No Puppeteer yet, no PDF, no form-UI changes. Pure rendering-contract proof.

If the Service Contract clears, run TruGreen (`_y82eIYLca`) as a second confirmation before exiting D.1 — image-original + branded logo + complex layout exercises the dimensions Service Contract doesn't.

## Exit bar

David opens `/a/{shortId}/preview` for the Service Contract in a browser, views it next to the original PDF, and confirms: typography, colors, header/footer, section structure, clause numbering, and overall feel are recognizable. Doesn't have to be pixel-perfect — has to be "clearly the same document."

If TruGreen also clears, D.1 ships. If TruGreen fails, we either iterate the prompt or extend `StyleFingerprint` before opening D.2.

## Phase D-wide decisions locked alongside this sub-phase

These are decided once, hold for D.1 → D.4:

1. **Template storage:** in-DB on `agreements.template_html` (+ separate `template_css` and `font_imports_json` columns). Simpler than file storage; transactional with the schema row.
2. **Render cadence:** Opus generates HTML **once at ingest**, persisted with the agreement. Per-submission renders (D.2) just inject submission values into the stored template via Puppeteer. Keeps Opus cost bounded; per-submission render becomes CPU-only.
3. **PDF-originals:** regenerate HTML from the fingerprint (do not preserve the embedded text layer). Keeps the rendering pipeline single-path; Opus reads PDF text cleanly enough for MVP.
4. **Multi-page:** preserve N→N page mapping via `break-before: page`. Four pages in → four pages out. Honors user mental model.
5. **Cache policy:** regenerate the PDF on every download in MVP. Click-to-download latency on a 3-page doc projects to 1–2.5s end-to-end (Puppeteer cold-start + render). If it lands worse than 3s on the test corpus, add per-submission caching keyed on hash(`dataJson` + `templateHtml`).
6. **Compare view (D.2):** side-by-side at full width on desktop / laptop; toggle on mobile. Mobile is a primary surface — the church + PGA TOUR Tour Forms v2 use cases need on-phone management.
7. **Form UI variants (D.3):** two — selective (typography + palette only) and full (typography + palette + header composition + layout cues). David picks after side-by-side review on 2 docs.
8. **Bad-palette protection:** auto-degrade form UI to neutral palette when contrast/accessibility fails (WCAG AA contrast ratio); show inline notice that names the specific trigger (e.g. *"Original used `#8a1c1c` on `#f2a89a` — contrast ratio 2.1:1, below WCAG AA. Form colors auto-adjusted; generated PDF preserves original."*).
9. **Logo handling:** crop logo region from the source image at ingest time using `sharp`, store at `agreements/{id}/logo.png`, reference in the generated template. High-value for branded-doc fidelity.
10. **Soft-fail on HTML generation:** if the Opus template pass fails, persist the agreement without a template; show "Template generation failed — Retry" with a button posting to a regenerate endpoint. No data loss, no blocked ingest.
11. **PDF only on final submit:** drafts don't generate PDFs. Saves Puppeteer cycles and matches the user mental model ("I download my PDF when I'm done"). Phase E adds a second pass with signatures embedded.
12. **Exit-bar corpus:** TruGreen + Termite + Service Contract + Bicycle Agreement. Substitute from prior agreements if a gap surfaces.

## Rendering contract — what Opus emits

A new tool, `record_agreement_template`, called once at ingest time after the verify pass. Returns three top-level properties:

```
{
  templateHtml: string   // complete <!DOCTYPE html> document
  templateCss: string    // separate CSS, embedded into <head> by us
  fontImports: string[]  // Google Fonts URLs to <link> in <head>
}
```

**Why a complete HTML document, not a fragment.** Puppeteer renders complete documents. No template engine, no React tree assembly. The rendered output IS the PDF input.

**Why separate CSS + HTML even though we re-merge.** Lets the prompt produce them with clear separation of concerns; gives us a clean place to inject the SHA-256 footer styles in D.2 without touching the model output; keeps the diff readable when we iterate.

**Field placeholders use HTML data attributes**, not Mustache:

```html
<span data-field="client-name" class="filled-value"></span>
<span data-field="payment-amount-per-hour" class="filled-value"></span>
```

Per-submission rendering (D.2) walks the DOM, finds every `[data-field]`, injects the value from `submission.dataJson`. For grouped fields:

```html
<div data-field-group="owners">
  <div data-field-instance>
    <span data-field="owner-name"></span>
    <span data-field="owner-address"></span>
  </div>
</div>
```

For signatures (Phase E):

```html
<div data-signature-block="client-signature" class="signature-slot"></div>
```

D.1 leaves these empty / shows blank lines. Phase E fills them.

**Curated Google Fonts shortlist** (prompt picks from this, no free-form font names):

- **Serif body:** Source Serif 4, Lora, Crimson Pro, EB Garamond
- **Sans body:** Inter, Source Sans 3, Roboto, Open Sans
- **Display / title:** Playfair Display, Merriweather, Montserrat
- **Mono:** IBM Plex Mono, JetBrains Mono, Source Code Pro

Each maps to a known Google Fonts URL in `src/lib/vision/fonts.ts`; the prompt is constrained to pick from this list with a "best visual match" instruction.

## Logo handling at ingest

When `styleFingerprint.layout.logoPresent === true`, a new step runs after the verify pass:

1. Ask Opus a quick targeted call: *"Return the bounding box of the logo in normalized 0–1 coordinates as `{page, x, y, w, h}`."*
2. Crop that region from the corresponding source image (or rasterized first PDF page) using `sharp`.
3. Store at `agreements/{id}/logo.png` via the Storage interface.
4. Persist the path on `agreements.logo_path`.
5. The generated HTML template references `/api/storage/agreements/{id}/logo.png`.

If the bounding-box call fails or the crop is degenerate (zero-size, all-background), soft-fail: no logo embedded, but the template still renders.

## Soft-fail flow

If `generateAgreementTemplate` throws or returns invalid HTML (basic sanity check: parses as a document, has a `<body>`):

- Agreement still persists with schema + style fingerprint + workflow
- `agreements.template_html` stays NULL
- `/a/{shortId}/preview` shows: *"Template generation failed for this agreement. [Retry]"*
- Retry button POSTs to `/api/agreements/{id}/regenerate-template`, which re-runs the Opus pass

No data loss, no blocked ingest, no failed user uploads.

## Files to touch

**New:**
- `src/lib/vision/fonts.ts` — curated Google Fonts shortlist + URL helpers
- `src/lib/vision/tool-schema-template.ts` — `recordAgreementTemplate` tool definition
- `src/lib/vision/template.ts` — `generateAgreementTemplate(schema, fingerprint, sourceInput)` Opus call
- `src/lib/vision/logo-crop.ts` — bounding-box call + sharp crop + storage put
- `src/app/a/[shortId]/preview/page.tsx` — HTML preview endpoint
- `src/app/api/agreements/[id]/regenerate-template/route.ts` — soft-fail retry POST endpoint

**Modified:**
- `src/lib/db/schema.ts` — add `templateHtml`, `templateCss`, `fontImportsJson`, `logoPath` columns on `agreements`
- `src/lib/db/queries.ts` — surface the four new fields on `AgreementRecord`
- `src/app/api/ingest/route.ts` — call `generateAgreementTemplate` + logo crop after verify; soft-fail on error
- `scripts/migrate.ts` — additive: four new columns
- `package.json` — add `sharp`

## Prompt structure (high-level)

System prompt frames Opus as a faithful document reproducer:

1. Receive the schema, style fingerprint, and source images / PDF
2. Pick fonts from the curated list (provided inline) that best match the source
3. Emit complete HTML mirroring the source's section structure, headings, clause numbering, body text where possible
4. Emit CSS that applies the fingerprint's palette + typography + layout cues + page size + margins
5. Use `data-field` attributes for every fillable field by ID
6. Use `data-signature-block` for every signature block
7. Use `data-field-group` + `data-field-instance` for repeating templates
8. Include `@page` rules for page size and margins; use `break-before: page` at section boundaries for multi-page image inputs

Critical instructions baked in:
- **Never make up content not visible in the source.** Section headings, clause numbers, and body text must come from the source.
- Where source has a fillable blank, emit the empty `[data-field]` span — do not invent placeholder values.
- For multi-page image input, emit one logical page break per source page using `positionHint.page` as the guide.

## What's explicitly NOT in D.1

- Puppeteer / PDF generation (D.2)
- SHA-256 footer (D.2)
- Compare view upgrade (D.2)
- Form UI styling experiment (D.3)
- Multi-doc validation pass (D.4)
- Re-rendering on schema edits — agentic refinement is Phase G
- Caching strategies — irrelevant until per-submission render exists

## Validation steps

1. Re-ingest the Service Contract PDF
2. Open `/a/{shortId}/preview` next to the original PDF in two browser tabs
3. David eyeballs it. Pass / iterate / extend fingerprint
4. If pass: re-ingest TruGreen, repeat
5. If TruGreen passes: D.1 ships, decisions captured here, PR opened against `main`
