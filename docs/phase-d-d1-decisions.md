# Phase D.1 — Rendering contract decisions

Scope: per-document HTML/CSS template generation as Opus-emitted output persisted with the agreement, plus the logo extraction side-pipeline. This is the foundation that Phase D.2 (Puppeteer PDF rendering) and Phase D.3 (form UI styling experiment) both build on.

Two documents cleared the eye-test alongside their originals: Service Contract (`N-DvD6gFJN`, PDF-original) and TruGreen (`_y82eIYLca`, image-original with logo soft-fail). D.1 ships with both passes captured as the exit-bar evidence.

---

## 1. Template is generated ONCE at ingest, not per-submission

**Decision:** `generateAgreementTemplate` runs after the extract + verify passes and persists its output on the `agreements` row. Every per-submission render (D.2's PDF pipeline) reuses the stored template, walking the DOM to inject submission values into `[data-field]` placeholders.

**Why:**
- Bounds the Opus cost. Ingest is a one-shot. Per-submission PDF rendering becomes CPU-only (Puppeteer).
- Makes rendering deterministic for the same submission + template.
- Keeps the template stable across a submission's lifecycle — the signer's draft view, submitted view, and signed view all render against the same HTML.

**Trade-off:** if the Opus template pass generates bad output once, every downstream render is affected until regenerated. Mitigated by the regenerate endpoint + soft-fail flow.

---

## 2. Template stored in-DB, three columns

**Decision:** `agreements.template_html`, `agreements.template_css`, `agreements.font_imports_json` — all nullable, all additive. Logo path lives alongside at `agreements.logo_path`.

**Alternative considered:** file storage at `agreements/{id}/template.html`.

**Why DB:**
- Transactional consistency with the schema row — one SELECT loads everything the preview and future PDF pipeline need.
- Simpler failure modes than filesystem + DB row out-of-sync.
- Schema row is already JSON-heavy; adding 25KB of template HTML is in the same order of magnitude.

**When to revisit:** if template size grows past ~200KB on complex docs, or when we port to Cloudflare D1 (which has per-row size limits). At that point, move to R2-backed storage with the keyed reference pattern.

---

## 3. Rendering contract: three siblings, data-attribute placeholders

**Decision:** The `record_agreement_template` tool returns three top-level properties:

```
{ templateHtml, templateCss, fontImports }
```

- **templateHtml** is a complete `<!DOCTYPE html>` document, not a fragment. Puppeteer renders complete documents; no template engine, no React tree assembly. The rendered output IS the PDF input.
- **templateCss** is kept separate so D.2's SHA-256 footer styles can compose cleanly without touching the model output.
- **fontImports** gives us a clean list to `<link>` even if Opus omits some in the HTML head.

Field placeholders use HTML data attributes, not Mustache:

```html
<span data-field="client-name" class="filled-value"></span>
<div data-field-group="owners">
  <div data-field-instance>
    <span data-field="owner-name"></span>
  </div>
</div>
<div data-signature-block="client-signature" class="signature-slot"></div>
```

**Why data-attributes:** per-submission injection walks the DOM with `querySelectorAll('[data-field]')` — no template engine dependency, no regex on HTML strings, safe across any `innerText`-vs-`innerHTML` choice D.2 makes.

---

## 4. Curated 14-font Google Fonts shortlist

**Decision:** `src/lib/vision/fonts.ts` exposes exactly 14 font families grouped by category (serif-body, sans-body, display, mono), each with a pre-built Google Fonts CSS URL. The prompt renders this list as a markdown table and constrains Opus to pick from it.

**Why constrained:**
- Opus will happily emit "Helvetica Neue" or vendor-specific family names that won't load in the browser. Constraining the list prevents unloadable fonts.
- Each category gives 2–4 options that cover the likely source-document typography range (legal serif → consumer sans → branded display → mono for form numbers).
- Google Fonts URLs are stable and don't require bundling fonts into the app.

**When to expand:** add fonts in the same file as specific-doc needs arise. Opus only sees the list at prompt time, so additions are zero-risk.

---

## 5. Page padding must live on BOTH @page AND a container class

**Lesson learned from Service Contract eye-test:** `@page { margin }` applies only to print/PDF media — the browser preview ignores it, leaving content touching the iframe edges.

**Pattern the prompt now enforces:**

```css
@page { size: letter portrait; margin: 0; }
.signflo-page {
  padding: 1in;
  max-width: 8.5in;
  margin: 0 auto;
  box-sizing: border-box;
}
```

Setting `@page margin: 0` and putting all real margin on `.signflo-page` padding means screen and print render identically. Every page section MUST be wrapped in `<section class="signflo-page">`, even for single-page documents.

**Why this matters beyond D.1:** Phase D.2's Puppeteer render will land pixel-identical to the preview. If the preview has proper padding, the PDF will too. One source of truth.

---

## 6. Logo extraction: two-pass with self-critique, fail-closed

**Decision:** Logo cropping is a two-step pipeline:

1. **bbox call** — Opus returns normalized `{page, x, y, w, h}` coordinates for the logo region, with the style fingerprint's `logoPosition`, `header` description, and `palette.primary` passed as hints.
2. **self-critique** — we crop with `sharp`, show Opus BOTH the full source image AND the cropped region, and ask "does this actually contain the brand logo?" via a `confirm_logo_crop` tool. If `confirmed: false`, the crop is deleted and `logoPath` persists as NULL.

**Why self-critique was necessary:** TruGreen phone-photo validation surfaced that Opus's raw spatial coordinate output isn't reliable on phone photos. Three attempts (bare prompt, hint-aware prompt, hint-aware + negative-example prompt) all produced wrong crops. The self-critique pass caught them cleanly.

**Governing principle: missing > wrong.** A null logo is rendered as empty space (the brand color + header text in the template carry brand identity). A wrong logo — a handwritten scribble rendered where the brand mark should be — would tank the "clearly the same document" bar worse than absence. This mirrors the Phase A "no hallucinated fields" rule.

**Image-sources only.** PDF-original logo extraction requires rasterization we haven't built in D.1. PDFs skip logo extraction entirely and rely on brand color + header text.

**Regenerate semantics:** the retry endpoint always uses the fresh result, including null. If the user clicked regenerate, they're unhappy with the current crop — we trust the new attempt over the old.

**Soft-fail throughout:** logo failure never blocks template generation or ingest.

---

## 7. Storage route whitelist expanded to `agreements/`

**Decision:** `/api/storage/[...key]` now accepts paths under `sources/`, `submissions/`, AND `agreements/`.

**Why:** the Phase B whitelist was `sources/` + `submissions/`; Phase D.1 introduced `agreements/{id}/logo.png` as a new key prefix and the gate rejected it.

**Safety unchanged:** `LocalStorage` still strips `..` and leading slashes; the whitelist is belt-and-suspenders against escape-via-crafted-keys, not the primary defense.

---

## 8. Soft-fail flow + regenerate endpoint

**Decision:** if `generateAgreementTemplate` throws or produces invalid HTML (missing `<body>`, etc.), the agreement still persists — schema, style fingerprint, workflow, and sources all intact — but `template_html` stays NULL. The preview surface shows a "Template generation failed — Retry" button that POSTs to `/api/agreements/{id}/regenerate-template`.

**Why:**
- The schema is the load-bearing value. Losing the ingest because HTML generation errored would be catastrophic.
- Regeneration lets us iterate the prompt and re-run on an existing agreement without re-uploading. This is how both validation docs (Service Contract + TruGreen) were tested in this sub-phase.
- The button doubles as an "iterate template" affordance when David wants to try a prompt change on a stored agreement.

---

## 9. Preview renders in an isolated iframe

**Decision:** `/a/[shortId]/preview` drops the composed HTML into an iframe via `srcDoc` with `sandbox="allow-same-origin"`.

**Why:**
- CSS isolation. The template's styles can't fight Tailwind chrome or vice versa.
- Mirrors what Puppeteer will see in D.2. If it renders right here, it'll render right in the PDF.
- Keeps the Next.js shell minimal around the template; the template is what's being evaluated.

**Composition step at render time:**
- Substitute `{{AGREEMENT_ID_PLACEHOLDER}}` → real agreement ID for logo URLs
- Inject font `<link>` tags into `<head>` (defensive; Opus usually adds them but we guarantee)
- Inject the `<style>` block with templateCss (defensive; if Opus kept CSS out of HTML and in the separate field)
- Inject a logo-hide CSS block when `logoPath` is NULL so broken-image icons don't leak through

---

## What's explicitly NOT in Phase D.1

- **Puppeteer / PDF generation** — Phase D.2
- **SHA-256 footer** — Phase D.2
- **Compare view upgrade (original + generated side-by-side)** — Phase D.2
- **Form UI styling experiment (selective vs full fingerprint application)** — Phase D.3
- **Multi-doc validation pass** — Phase D.4
- **Text-based logo fallback** — follow-up candidate for D.2 or D.4. Render "TRUGREEN" in Montserrat + brand green when logo extraction soft-fails, instead of empty space.
- **Agentic refinement of templates** — Phase G

---

## Open questions for David (when reviewing)

- The `{{AGREEMENT_ID_PLACEHOLDER}}` convention for logo URLs works for now, but if Phase E signatures land as `/api/storage/agreements/{id}/signatures/{blockId}.png`, we may want a more general templating helper rather than one-off placeholders. Worth deciding at the D.2 seam.
- PDF-originals currently skip logo extraction entirely. Low-priority, but worth raster-extracting if a future PDF-original doc has a strong visual brand.
- Self-critique adds a ~5–10 second second Opus call per image-original ingest with `logoPresent: true`. Acceptable at current volumes; if ingest latency budget tightens, we could cache per-URL-hash to skip critique on repeated re-ingests of the same source.

---

## Validation evidence (for the D.1 exit bar)

| Doc | Source kind | HTML size | CSS size | Fonts picked | Logo outcome | David verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Service Contract | PDF (clean) | ~20 KB | ~3 KB (v1) / ~9 KB (v2) | Source Sans 3 (v1), Open Sans (v2) | N/A (PDF skip) | "PERFECT" after padding fix |
| TruGreen | Image (branded phone photo) | ~22 KB | ~9 KB | Source Sans 3 + Montserrat | Soft-failed after self-critique rejected wrong crops; rendered with brand color + header text only | "This is acceptable. We can move forward" |

Exit bar cleared.
