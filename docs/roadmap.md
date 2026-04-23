# Signflo — roadmap

**Last updated:** 2026-04-23
**Status:** Phase A + Phase B (light) shipped. Phase C (foundations) active.

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

### 🟡 Phase C — Foundation upgrades (active)

Everything that sets downstream phases up for quality. No user-facing features beyond what Phase B light ships.

**1. `AgreementSchema` upgrades**
- `fieldGroups`: repeating templates with N instances. Enables clean rendering of multi-row patterns (the 5-row shipping address) and informs the rendered PDF.
- `radioGroups`: explicit mutual-exclusivity emitted by Opus instead of checkbox-plus-workflow-hint inference. Addresses the pattern seen in Reliable Ducts payment options and Florida Pest Control.
- `signerRole: "self" | "counterparty" | "pre-signed"` on `SignatureBlock`. Disambiguates manufacturer pre-signatures (Carry-On MCO) from signer blocks that need filling.
- `constraints` array: cross-field rules (`one-of`, `at-least-n`, `matches-pattern`) expressed in the schema, feeding workflow-completeness in later phases.

**2. Extraction prompt + tool schema update**
- Teach Opus to emit the new shapes via updated tool schema + prompt guidance.
- Re-run the 8-document test corpus against the upgraded schema; confirm quality holds; record deltas in `docs/vision-spike.md`.

**3. Workflow state model** (data model only — no UI yet)
- `agreements.workflow_steps` JSON: ordered step sequence with role + required fields per step.
- `submissions.current_step` + `submissions.history`: transitions with timestamps.
- MVP exercises a single "self-sign" step; the data shape supports Party-A → Party-B routing + rework loops when the orchestrator lands.

**4. URL-as-bearer-token ownership**
- New `submission_tokens` table: 32-char URL-safe secret → submission id.
- `/s/{token}` route = owner's view of their in-progress or completed submission.
- Sharing the URL *is* the auth. Same model as DocuSign envelope links or unlisted Google Docs. No accounts, no login, no passwords.
- Matches epic non-goal on multi-tenancy/auth; still gives per-submission privacy.

**5. Form drafts**
- `submissions.status = "draft" | "submitted" | "signed"`.
- Debounced save from `FormRenderer` while typing.
- Resume via `/s/{token}` — form pre-fills from draft.
- Solves "my phone died mid-fill" and reinforces the digitize-on-your-phone narrative.

**Exit bar for Phase C:**
- All 5 items above are built and smoke-tested.
- Re-spike results committed to `docs/vision-spike.md`.
- `/a/{shortId}` still works from Phase B; new `/s/{token}` route serves owner views; drafts persist and resume.

### Phase D — Rendering + style-matched form UI

- Template HTML/CSS generator: Opus emits per-document HTML + CSS from `styleFingerprint`. Digital PDFs keep the text layer; image originals get best-match Google Fonts + extracted palette.
- Server-side Puppeteer PDF rendering; output stored at `agreements/{id}/{submissionId}.pdf`.
- **Form UI styling experiment:** prototype both *selective* (typography + palette only) and *full* (typography + palette + header composition + layout cues) style-fingerprint application on 2 test docs, side-by-side. David picks.
- Compare view (`/a/{shortId}/compare`) upgraded: original + generated PDF side-by-side. Primary surface for fidelity iteration.
- SHA-256 integrity hash stored with submission, printed in PDF footer.

**Exit bar:** David reviews 3+ generated PDFs side-by-side with originals and says *"clearly the same document"* on each.

### Phase E — Signing

- Signature capture with `signature_pad` — mobile-first, canvas → PNG.
- `signerRole` honored: `"self"` → capture signature; `"pre-signed"` → static "Already signed by: {party}"; `"counterparty"` → disabled, pending their turn.
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
