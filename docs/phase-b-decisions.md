# Phase B (light) — decisions made autonomously

Scope tonight: schema → live form + persistence + compare skeleton. Deferred to Phase B full (with David present): template HTML/CSS generation, Puppeteer PDF rendering, signature capture, final fidelity tuning.

Each decision below is an autonomous call — the alternative is listed so David can override.

---

## 1. Field grouping: flat fields, no `fieldGroups`

**Decision:** Render every extracted field as a standalone form control, including repeating table rows (e.g. the 5 address rows × 4 columns = 20 fields pattern we saw in the Alternate Shipping letter).

**Alternative considered:** Introduce a `fieldGroups` concept — a template `{street, city, state, zip}` with N instances — so the rendered form shows a table with "+ Add another row" UX and fewer visually-repetitive fields.

**Why flat:** Opus emits flat fields consistently across documents with stable pattern-based IDs (`alt-address-1-street`, `alt-address-2-street`, ...). Introducing a grouping concept means (a) changing the extraction schema shape, (b) re-running the spike to confirm it still produces consistent groups, and (c) designing the add/remove UX. All three are Phase B full territory.

**How to override:** add a `fieldGroups` array to `AgreementSchema` in `src/lib/vision/types.ts`, teach the extraction prompt to identify them, and render in `FormRenderer`.

---

## 2. Radio-vs-checkbox: no auto-promotion

**Decision:** If the schema says `type: "checkbox"`, render a checkbox. If it says `type: "radio"`, render a radio group. Even when `workflowHints` say things like *"Payment options are rendered as checkboxes but effectively mutually exclusive"*, we don't auto-promote.

**Alternative considered:** Detect mutual-exclusivity hints in `workflowHints` and auto-group matching-prefix checkboxes into a radio group.

**Why no auto-promotion:** Requires a heuristic (group by ID prefix? label prefix? explicit in the hint?) that will be wrong on some documents. Better to let the model express intent directly in the schema (future work: extend the tool schema to emit `radioGroups`).

**How to override:** either (a) tighten the extract prompt so Opus emits `radio` where appropriate, or (b) parse `workflowHints` in `FormRenderer` and promote checkbox clusters.

---

## 3. Signature blocks: no `signerRole` distinction

**Decision:** All signature blocks are treated the same. The form currently doesn't expose signature capture at all — that's Phase C.

**Alternative considered:** Add `signerRole: "self" | "counterparty" | "pre-signed"` so already-signed signatures (like the manufacturer block on the Carry-On MCO) render as static "Already signed by: ..." rather than asking the end user to re-sign.

**Why deferred:** This matters for Phase C (signature capture), not Phase B (form filling). Noted in `docs/vision-spike.md` as a follow-up.

**How to override:** add `signerRole` to the `SignatureBlock` type, teach the extract prompt, branch the signature-capture UI accordingly.

---

## 4. Form-state persistence: client-only

**Decision:** Form state lives in `react-hook-form`. A page reload loses it.

**Alternative considered:** Server-side drafts — save partial submissions to SQLite as the user types, restore on return.

**Why client-only:** Server drafts need an anonymous session or magic-link identity. That's auth-adjacent and the epic explicitly calls auth a non-goal. The MVP demo is "fill and submit in one session."

**How to override:** extend the `submissions` table with `status: "draft"`, add a debounced save effect in `FormRenderer`, load drafts by cookie or URL token on mount.

**Comments:** I think it would be better to have this, but I'm not sure we need it for Phase B. Thoughts?

---

## 5. File uploads: accepted, minimally validated

**Decision:** `type: "file"` fields render a standard browser file input. On submit, any uploaded file is stored under `uploads/submissions/{submissionId}/{fieldId}.{ext}` via `LocalStorage`. The submission data JSON stores `{ key, name, size, type }`. Missing file → `null`.

**Alternative considered:** Size limits, MIME type restrictions, per-field file requirements.

**Why minimal:** None of the test-corpus documents actually had file-upload fields. When a doc does, we can tighten based on what the field's `hint` says.

**How to override:** validate `file.size` and `file.type` in `/api/submissions/route.ts` before `storage.put`.

---

## 6. Validation scope: per-field only

**Decision:** Zod schemas enforce per-field type correctness (email format, phone regex, date format, number coercion) and `required`. No cross-field validation (e.g. "at least one payment option checked") and no date-range validation.

**Alternative considered:** Cross-field rules derived from `workflowHints` (e.g. "Payment Option group must have exactly one selected").

**Why not:** Same reason as the radio promotion — heuristic-driven and likely to be wrong. If we want cross-field rules, the schema should express them explicitly.

**How to override:** extend `AgreementSchema` with a `constraints` array (e.g. `[{type: "one-of", fieldIds: [...]}]`) and enforce in both the client (`FormRenderer`) and server (`/api/submissions`).

**Comments:** I'm generally fine with this but when we get to workflows, this means we need to be able to support a rework workflow; if we don't validate the fields and check for completeness, then we may need to send it back to the signer or send it back to Party A or B if something was not done correctly. 

---

## 7. Typography and color: default Tailwind stack

**Decision:** Form UI uses Tailwind's default `font-sans` (system UI stack) and a neutral grayscale palette. No Google Fonts loading yet. The *form-filling UI* looks clean and generic; the *rendered agreement PDF* (Phase B full) is where the style fingerprint gets applied.

**Alternative considered:** Apply the style fingerprint's typography to the form UI so the form visually matches the original document.

**Why not:** The form UI and the agreement PDF are different surfaces. Matching the original's style on the *form* risks looking like a knockoff; keeping it clean-neutral signals "Signflo wrapped around your document." Debatable — David can call it.

**How to override:** load Inter + Source Serif 4 via `next/font`, apply the extracted `styleFingerprint.typography` to the form wrapper.

**Comments:** I think that getting the form UI as close to the original document as possible would be a better user experience, and the better wow factor in the demo. That is what will make Signflo feel like a user has the ability to simply digitize the document by snapping a photo with their phone. I'm open to other ideas and would love to hear y'all's thoughts.

---

## 8. Signature field rendering: disabled placeholder

**Decision:** Signature fields render a dashed-border placeholder reading *"Signature capture ships in Phase C — placeholder."* Non-interactive.

**Alternative considered:** Integrate `signature_pad` now since the library is already installed.

**Why deferred:** Scope lock per the middle-ground agreement with David. Signature capture is Phase C.

**How to override:** replace the placeholder with a `<SignaturePad>` component (install already done: `signature_pad` in dependencies).

---

## 9. Compare view: dev-only, NODE_ENV-gated

**Decision:** `/a/[shortId]/compare` returns 404 in production (`NODE_ENV === "production"`). In dev it shows the original source alongside the extracted schema and the latest submission's field values.

**Alternative considered:** Public compare view; per-submission authorization.

**Why dev-only:** The compare view leaks the ingested source document and the extracted schema (including low-confidence flags). Fine for solo dev; not fine for a public link.

**How to override:** replace the env gate with a per-user auth check when we get to multi-user.

---

## 10. UX nit: `/ingest` now links to the form

After a successful ingestion, the `/ingest` result card now shows two buttons: "Open form →" (the public `/a/[shortId]` form) and "Compare (dev)" (the dev-only compare view). Faster dev iteration; no functional change.

---

## Open questions for David

- For the 5-row address pattern we saw in testing, do you want the form to render all 20 fields (current behavior) or start condensed and let the user expand rows?
  - I think that the current behavior is fine. It's better to have all the fields visible so that the user can fill them out without having to expand any rows. If the user doesn't need to fill out all the fields, they can just leave them blank. I am open to other ideas and would love to hear your thoughts.
- Are you OK with the form-filling UI staying visually neutral and saving the per-document look for the generated PDF only?
  - I think that we should apply the style fingerprint to the form UI so that the form visually matches the original document. That is what will make Signflo feel like a user has the ability to simply digitize the document by snapping a photo with their phone. I am open to other ideas and would love to hear your thoughts.
- In Phase B full, should the high-fidelity rendered PDF be visible inside the compare view, or only downloadable from `/a/[shortId]/complete`?
  - I think that we should make the rendered PDF visible inside the compare view. I am open to other ideas and would love to hear your thoughts.
- Do we want per-submission ownership/auth at all in MVP, or is "anyone with the URL can fill and submit" fine for the demo?
  - I think that we should implement per-submission ownership/auth in MVP. It's better to have it from the beginning than to add it later. 
  - I am open to other ideas and would love to hear your thoughts.
