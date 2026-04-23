# Vision ingestion spike — results

**Goal (per plan):** On at least 3 of 5 test documents, Opus 4.7 produces a schema with ≥90% field identification AND a style fingerprint complete enough to drive high-fidelity rendering. Low-confidence fields flagged (not silently wrong).

**Pipeline:** 2 Opus 4.7 calls per document — `extract` (tool-use structured output) + `verify` (self-critique pass that corrects the first).

---

## Results

| # | Document | Kind | Elapsed | Fields | Sigs | Hallucinations | Style FP | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Reliable Ducts AC — IAQ Options Proposal (v1 prompt) | digital PDF, 4pp | 57.2s | 13 | 1 | 2 (`signature-date`, `accept-terms` soft) | Rich — caught duck mascot, palette, step-numbered workflow | ⚠️ Fixed in v2 prompt |
| 2 | Donovan AC — Invoice / Customer Authorization | digital PDF, 2pp | 40.9s | 4 | 2 | 0 | Rich — specific fonts (Source Sans 3, IBM Plex Mono), navy/red palette | ✅ Pass |
| 3 | Reliable Ducts — re-run after prompt v2 | digital PDF, 4pp | ~35s | 9 | 1 | 0 | Rich — same quality as v1 | ✅ Pass — all phantoms gone |
| 4 | Phone photo — Southpoint church Order of Service (Easter 4/4) | image, angled | — | 2 | 1 | 0 | Caught the angle, Arial-like font, handwritten underlines | ✅ Pass — image path works |
| 5 | Phone photo — Alternate Shipping Address & Sales Tax Exemption Letter | image | — | 27 | 1 | 0 | Monochrome business letter, caught the partial crop and flagged it | ✅ Pass — multi-row table + conditional logic handled |
| 6 | Phone photo — Certificate of Origin / Warranty Registration (Carry-On Trailer) | image | — | 8 | 1 | 0 | Ornate guilloché border + watermark caught; correctly isolated fillable portion | ✅ Pass — dual-purpose doc disambiguated |
| 7 | Phone photo — Florida Pest Control Service Policy Renewal Notice (clean) | image | — | 23 | 2 | 0 | Pale mint paper, detachable stub, red-bordered AMOUNT ENCLOSED box | ✅ Pass — pre-printed data + handwritten "Paid" correctly excluded |
| 8 | Same doc, **poor lighting + shadows + rotated 180°** (stress test) | image | — | 23 | 2 | 0 | Same palette captured; rotation flagged in workflow hints | ✅ Pass — zero field loss vs. clean baseline, confidence degrades gracefully |

---

## Findings so far

### What's working

- **Multi-page handling** out of the box — fields detected across pages 2 and 4 of the 4-page HVAC proposal.
- **Style fingerprints are rich** — Opus consistently captures palette, typography (with concrete Google Fonts guesses like Source Sans 3), layout, header/footer content, and brand-specific notes (e.g. the Reliable Ducts cartoon duck mascot).
- **Self-reported confidence is calibrated** — low-confidence fields are flagged with defensible reasons (`"Rendered as checkboxes but mutually exclusive in practice"`).
- **Smart disambiguation** — on doc 1, Opus modeled the payment options as both a `radio` parent (semantic intent) AND child checkboxes (visible rendering). That's the right call, not a confusion.
- **Verify pass is doing real work** — second-pass output includes nuance (hint text, workflow hints, positional coordinates) beyond what a pure rubber-stamp would produce.

### Issues found and addressed

- **Hallucinated fields on doc 1.** `signature-date` at 40% with hint `"Not explicitly present on the form but commonly captured alongside signature"` — Opus invented a field from its priors about what "usually" accompanies a signature. For an agreement engine this is a correctness bug: we must only surface fields actually visible in the source.
- **Fix (prompt v2):**
  - `extract.ts`: added a non-negotiable "Critical correctness rule" section that bans emitting fields without a visible form element. Lists red-flag hint phrases (`"commonly captured"`, `"usually required"`, `"implied but not explicit"`) that MUST go into `workflowHints` or style `notes` instead.
  - `verify.ts`: re-ordered priorities so the first job of the verifier is to *delete* hallucinated fields and convert them into `workflowHints`.
- **Verified on re-run.** v2 produced 9 real fields (down from 13), zero phantoms. All four hallucinated items from v1 (`signature-date`, `accept-terms`, `payment-leased-through-name`, the `payment-option` parent wrapper) were correctly demoted into workflow hints. Bonus: the verifier also flagged the "Clear" link as a UI control (not a field) and noted that pre-filled customer details are not blanks to fill. Every remaining field has confidence ≥ 0.90.

### Timing observations

- 40–60s per document with two Opus calls. Acceptable for development; on the slow side for a hero demo where "photograph this → live form" is the wow moment.
- Future optimization paths (after MVP ships): (a) drop the verify pass for the demo flow and run async, (b) stream progress to the client, (c) consider a single-pass prompt for simpler documents.

---

## Exit-bar status

- **Pass count: 7 of 7 clean runs + 1 stress test survived.** Exit bar (≥3 of 5 passing with ≥90% field identification + usable style fingerprint) is cleared.
- Bad-lighting/shadowed/rotated stress test: zero field loss vs. clean baseline, no hallucinations, confidence degrades gracefully on exactly the fields we'd expect (pure-visual card logos).
- Opus 4.7 detected 180° image rotation and surfaced it as a workflow hint — potential preprocessing signal for Phase B.
- No preprocessing layer required for MVP. `sharp` auto-rotate is a future optimization, not a blocker.

## Follow-up notes for Phase B

- **ID stability.** Same document re-ingested produces different stable-string IDs for the same conceptual fields (e.g. `no-inspection-1-year` vs `inspection-option-1yr`). Fine for MVP; worth canonical derivation if we ever need schema versioning or re-ingest diffs.
- **Radio-vs-checkbox semantics.** Consistent pattern: Opus flags mutually-exclusive checkbox groups in `workflowHints` rather than emitting a `radio` parent. Renderer should detect these hints and promote to radio groups.
- **Field grouping.** Multi-row forms (5-address shipping letter) emit flat fields with pattern IDs (`alt-address-1-street`, …, `alt-address-5-street`). Future schema feature: `fieldGroups` with a template + N instances, for prettier rendering of "+ Add another" UX.
- **Already-signed signature blocks.** Vehicle MCO surfaced a pre-signed manufacturer signature in the schema. A `signerRole: "self" | "counterparty" | "pre-signed"` would disambiguate.
- **Per-document timing:** digital PDF 35–57s, phone image 30–50s. Two Opus calls (extract + verify). Demo consideration: single-pass path for the hero flow with async verify.

---

# Phase C re-spike — targeted diagnostic run (2026-04-23)

After the Phase C schema upgrades (`fieldGroups`, `radioGroups` via collapsed-radio emission, `signerRole`, `constraints` discriminated union) landed, we re-ingested 3 diagnostic documents from the Phase A corpus to verify the new shapes emerge correctly.

## Diagnostic checks

| Doc | What we were testing | Result |
| --- | --- | --- |
| Reliable Ducts AC | Radio collapse of 6 mutually-exclusive payment checkboxes | ✅ Single `radio` field "Choose Your Payment Option" with all 6 options in `options[]`. `signerRole: "self"` on the Purchaser block. |
| Alternate Shipping Letter | Promotion of 5 repeating address rows to a `FieldGroup` | ✅ Flat fields collapsed from 27 → 6 top-level + 1 `FieldGroup` "Alternative Shipping Addresses" (template: street/city/state/zip, initial=5, min=1, max=5). Bonus: `all-or-none` constraint correctly emerged for the "if you provide a tax exemption cert, also provide the region" pattern. Low-confidence list collapsed from 17 → 1. |
| Carry-On Trailer MCO | `signerRole: "pre-signed"` detection on the manufacturer signature | ✅ Manufacturer block correctly marked `signerRole: "pre-signed"` (was `None` in Phase A). Bonus: DOT Tire Identification Numbers grid promoted to a `FieldGroup` (template: QTY + Number, initial=11). |

## Issues found and addressed during the re-spike

### Constraint hallucination (Reliable Ducts, first pass)

First-pass Phase-C Reliable Ducts emitted a `one-of` constraint referencing both `payment-option` (how to pay) AND `equipment-option-budget` (what equipment to buy) — semantically wrong, these are independent decisions.

**Fix:** tightened both the extract and verify prompts:
- Added a "Constraints must be SEMANTICALLY HOMOGENEOUS" rule — every field in a constraint's `fieldIds` must be an alternative of the same decision or category.
- Added a "prefer radio collapse over `one-of`" rule — avoid constraints that duplicate what a `radio` field already expresses.
- Added explicit negative examples of the payment-vs-equipment mis-constraint pattern.
- Verifier got a matching rule to strip constraints whose members span unrelated decisions.

**Verified on re-run.** Reliable Ducts re-ingested after the prompt fix: `constraints: []` (correctly restrained). Radio collapse + `signerRole` + all other shapes preserved.

### Tool-input "double wrap" bug (discovered mid-spike)

An intermediate Reliable Ducts run produced a response where Opus stuffed the entire `ExtractionResult` under the tool's `schema` property, leaving `styleFingerprint` and `lowConfidenceFieldIds` undefined. Caused by name collision between the tool's internal `schema` property and the conversational notion of "the whole extracted schema."

**Fix:**
- Renamed the tool's top-level `schema` property to `agreement`. `record_extracted_agreement` with a property called `agreement` has no semantic collision with "the whole result."
- Added an explicit "populate THREE top-level properties as siblings, NOT nested inside each other" instruction to both prompts.
- Added a defensive `parseExtractionResult()` helper that handles three input shapes: the correct new shape, the old `schema`-named shape, and the double-wrapped mis-response — so any future Opus drift doesn't break the ingest API.
- Added defensive normalization on the `/ingest` client page so a malformed API response can't crash the UI.

**Verified on re-run.** Schema stored correctly (title at root, 4 fields, 1 signature block with `signerRole: "self"`, empty constraints, styleFingerprint and lowConfidenceFieldIds columns populated).

## Phase C shape deltas (vs. Phase A)

- **Reliable Ducts:** 9 fields → 4 fields + 1 radio (with 6 collapsed options)
- **Alt Shipping:** 27 flat fields → 6 top-level fields + 1 FieldGroup (4 fields × 5 instances) + 1 `all-or-none` constraint
- **Carry-On MCO:** 8 flat fields + 0 signerRole → 6 top-level + 1 FieldGroup (2 fields × 11 instances) + `signerRole: "pre-signed"`

Token spend on the re-spike + debugging: roughly 8 Opus 4.7 calls (~$3–4).
