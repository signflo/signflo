# Signflo — roadmap

**Last updated:** 2026-04-24
**Status:** Phases A, B (light), and C all shipped (PRs #1–#10 merged). Phase D next — rendering + style-matched form UI + high-fidelity PDF.

## Framing

Signflo is an OSS Agreement Engine: phone photo or digital PDF → structured schema → live signable agreement → ownable self-hostable repo, powered by Claude Opus 4.7.

Originally planned as a 6-day build during the week of the Anthropic "Built with Opus 4.7" hackathon (4/21–4/27). After Phase A and Phase B (light) shipped, we re-anchored around **quality over timeline** — the hackathon window passed before David could register, and the real ROI is (a) learning, (b) a variant for Jacksonville Southpoint SDA church, (c) patterns that inform PGA TOUR Tour Forms v2. See `memory/signflo_quality_over_timeline.md` for the durable collaboration directive.

The original Jira epic (CPG-176 + children) is a **historical artifact**. This file is now the canonical plan.

## Phases

Phases are grouped by logical dependency, not calendar date. Completion criteria are exit bars, not deadlines.

### ✅ Phase A — Ingestion (shipped, PR #1)

- Scaffold: Next.js 16, TS strict, Tailwind v4, App Router, src/ layout
- Drizzle ORM + better-sqlite3 behind a Storage + DB interface; swap-ready for Cloudflare D1 + R2
- Opus 4.7 vision pipeline: extract (tool-use structured output) + verify (self-critique) passes
- Images go direct to Opus as `image` content blocks; digital PDFs as `document` blocks with pdfjs-dist text-layer enrichment
- Strict correctness rule in the extraction prompt: only emit fields corresponding to visible form elements
- `/ingest` UI with drag-drop + camera capture + PDF upload
- ADR at `docs/adr/001-stack.md`; spike log at `docs/vision-spike.md`
- **Verified on 8 real documents** (7 clean + 1 shadowed/rotated stress test, zero field loss)

### ✅ Phase B (light) — Form + Submission (shipped, PR #2)

- Schema → React form renderer with per-type controls (text / email / phone / date / number / checkbox / radio / select / file)
- Zod validation derived from `AgreementSchema.fields`; onBlur mode in react-hook-form
- Low-confidence fields flagged with amber "verify" badges
- `/a/{shortId}` public form route; persistence to `submissions` table via `/api/submissions`
- `/a/{shortId}/complete` confirmation screen
- `/a/{shortId}/compare` dev-only side-by-side view (original source + extracted schema + submission)
- File uploads via LocalStorage at `submissions/{id}/{field}.{ext}`
- `/api/storage/[...key]` GET endpoint, prefix-gated to `sources/` and `submissions/`
- Decisions captured in `docs/phase-b-decisions.md` (David's review annotations preserved)

### ✅ Phase C — Foundation upgrades (shipped, PRs #3–#10)

Foundation pass that sets downstream phases up for quality. Four sub-phases + two cleanup PRs delivered end-to-end:

**✅ C.1 — `AgreementSchema` upgrades (PR #4)**
- `fieldGroups`: repeating templates with N instances. Cleanly renders multi-row patterns like the 5-row shipping address; informs downstream PDF rendering.
- `signerRole: "self" | "co-signer" | "counterparty" | "pre-signed"` on `SignatureBlock`. Disambiguates manufacturer pre-signatures (Carry-On MCO) from signer blocks that need filling.
- `constraints` array (discriminated union of `one-of` / `at-least-n` / `all-or-none`): cross-field rules expressed in the schema. **Service Contract validation surfaced 5 correct constraints on first ingest.**
- Radio-vs-checkbox: prompt teaches Opus to emit `type: "radio"` with collapsed `options[]` instead of N checkboxes + a "mutually exclusive" workflow hint. No new `radioGroups` concept needed.
- Defensive `parseExtractionResult()` for Opus tool-call drift (handles the "double-wrap" regression we saw mid-spike).
- Re-spike against 3 diagnostic documents confirmed behavior.

**✅ C.2 — Workflow state model (PR #5)**
- `agreements.workflow_steps_json`: ordered step sequence per role.
- `submissions.current_step_index` + `submissions.history_json`: transitions with timestamps.
- `deriveDefaultWorkflow()` generates one step per non-pre-signed role; `canTransition()` + `advanceStep()` + `reworkTransition()` helpers.
- Data model supports multi-party routing (Party A → Party B → signed) + rework loops, though MVP only exercises single self-sign.
- Submissions persist unconditionally when Zod-valid; workflow advance is a separate check that reports `missingFieldIds` / `missingSignatureBlockIds` without blocking.

**✅ C.3 — URL-as-bearer-token ownership (PR #6)**
- `submission_tokens` table: 32-char URL-safe secret (~192 bits entropy) via `crypto.randomBytes` → base64url.
- `/s/{token}` route = owner's view. No accounts, no passwords. Same security model as DocuSign envelope links.
- Uniform 404 on invalid token (no enumeration oracle).
- Role enum (`owner` / `viewer` / `reviewer`) ready; MVP only mints owner.

**✅ C.4 — Form drafts (PR #7)**
- `/api/drafts` endpoint — JSON upsert, no Zod validation, no workflow transition, no files.
- `useDraftSave` hook — 1500 ms debounce; first save mints a token + rewrites URL to `/s/{token}` via `history.replaceState`.
- `/s/{token}` branches on status: `draft` → editable FormRenderer with saved values; `submitted`/`signed` → read-only owner view.
- Draft → submitted keeps the SAME token and SAME submission row — bookmarks survive the lifecycle.

**✅ Cleanup — validation-surfaced fixes (PRs #8, #9, #10)**
Two-wave validation pass against 6 documents (4 before cleanup + bicycle synthetic + Service Contract after) surfaced 11 issues. All closed:
- **PR #8 issues:** self-step synthesis when no self block; `filledByRole` per field; `section` field grouping; low-confidence banner when most fields flagged; Phase E grouped-signature note in roadmap.
- **PR #9 issues:** multi-page image ingestion (`source_paths_json`, `sources/{id}/page-{N}.{ext}`, N image content blocks with "Page X of N:" labels); dedicated Take Photo button; compare view upgraded for multi-page.
- **PR #10 issues** (merge-timing race): page reorder buttons; per-field server error display; stale-error silent-resubmit fix; signature-required block-submit fix; synthetic test generator.

**Reference docs:** `docs/phase-c-workflow-decisions.md`, `docs/phase-c-bearer-token-decisions.md`, `docs/phase-c-drafts-decisions.md`, `docs/phase-c-multi-page-decisions.md`, `docs/phase-c-validation-log.md`.

### 🔜 Phase D — Rendering + style-matched form UI (next)

- Template HTML/CSS generator: Opus emits per-document HTML + CSS from `styleFingerprint`. Digital PDFs keep the text layer; image originals get best-match Google Fonts + extracted palette.
- Server-side Puppeteer PDF rendering; output stored at `agreements/{id}/{submissionId}.pdf`.
- **Form UI styling experiment:** prototype both *selective* (typography + palette only) and *full* (typography + palette + header composition + layout cues) style-fingerprint application on 2 test docs, side-by-side. David picks.
- Compare view (`/a/{shortId}/compare`) upgraded: original + generated PDF side-by-side. Primary surface for fidelity iteration.
- SHA-256 integrity hash stored with submission, printed in PDF footer.

**Exit bar:** David reviews 3+ generated PDFs side-by-side with originals and says *"clearly the same document"* on each.

### Phase E — Signing

- Signature capture with `signature_pad` — mobile-first, canvas → PNG.
- `signerRole` honored: `"self"` → capture signature; `"pre-signed"` → static "Already signed by: {party}"; `"counterparty"` → disabled, pending their turn.
- **Two signature container patterns to handle** (validation log issue #3): top-level `signatureBlocks` (most docs) AND `type: "signature"` fields nested inside FieldGroup templates (e.g. one signature line per owner row in a DBA Certificate of Ownership). The capture UI must work for both shapes.
- Signed PDF generation: second Puppeteer pass with signature image embedded at the correct coordinates.
- Signed-at timestamp + post-sign hash stored with submission.

**Exit bar:** full journey — photo → form → fill → sign → download signed PDF — works cleanly on mobile Safari/Chrome.

### Phase F — Repo export

- Pre-scaffolded template at `templates/signflo-agreement-template/`: runnable Next.js app with schema slot, template slot, minimal form + sign + PDF code.
- `POST /api/export/{agreementId}` generates a zip via `archiver`, populated with the agreement's schema + template + SHA.
- "Download repo" button on the completion page.
- Quality gate: clone the downloaded zip into a clean dir, install + run, verify it reproduces the agreement end-to-end.
- GitHub OAuth push = follow-up, not MVP.

**Exit bar:** downloaded zip, unzipped and run in a clean dir, reproduces the agreement with no external deps beyond an Anthropic API key.

### Phase G — Polish + demo

No longer "if time" stretch — these are real decisions at Phase G.

- **Agentic refinement (CPG-184).** Conversational edits to an agreement schema/template. Third pillar of the pitch. Commit TBD at Phase F → Phase G seam based on how the core feels.
- **Word/DOCX ingestion (CPG-185).** `mammoth` + extract text → feed into the existing vision pipeline as a text-layer enrichment. Digital PDF is already done in Phase A.
- **Demo recording + blog post + public launch.** Scripted demo, Loom recording, 1500–2000 word blog post with architecture walkthrough, social amplification.

## Decisions locked this morning (2026-04-23)

- **Auth scope:** URL-as-bearer-token, not full auth. (`/s/{token}` model.)
- **Form UI styling:** apply style fingerprint — form looks like the original, not generic.
- **PDF in compare view:** yes, make rendered PDF visible alongside original.
- **Drafts:** build in Phase C. Cookie-bound initially, token-bound once #4 lands.
- **Cross-field validation:** per-field in Phase C; workflow-completeness belongs with the orchestrator in Phase E or later.
- **Stretch → real:** agentic refinement and DOCX ingestion get proper consideration at Phase G.

## Working agreements

- **Local-first.** No Cloudflare provisioning until Phase G or later. DB + Storage behind interfaces; the eventual D1 + R2 port is a driver change.
- **Clean-room.** No PGA TOUR IP enters this repo.
- **Feature-branch + PR.** Never commit directly to `main`. Stacked PRs when dependencies exist.
- **Quality over timeline.** See `memory/signflo_quality_over_timeline.md`. Foundation work precedes flashy work.
- **Semantic commit format:** `<type>(<scope>): <subject>` with narrative WHY in body.
