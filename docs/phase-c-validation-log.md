# Phase C validation log — 6-document cross-section

Running new documents through the fully-stacked Phase C pipeline to surface shape/workflow/UI gaps we didn't catch with the 3 diagnostic docs from the re-spike. Two waves:

- **Wave 1 (docs 1–4):** before-merge validation against the PR #4–#7 stack. Surfaced 7 issues (see table below) that fed PRs #8 and #9.
- **Wave 2 (docs 5–6):** post-PR-#9 validation against the fully-cleaned stack. Confirmed fixes hold end-to-end; surfaced 4 additional form-pipeline bugs that went into PR #10 (per-field error display, silent resubmit, signature-required block, auto-save stuck).

Findings are **batched** — we accumulate here and fix together, not one-PR-per-bug.

**Final Phase C status:** all 7 validation issues closed across PRs #8 + #9; 4 additional form-pipeline bugs closed in PR #10 (after a merge-timing race). Phase C is fully shipped.

---

## Issues accumulating (rolling list)

Severity tags: 🚩 P1 blocks demo | 🟡 P2 worth fixing before public | 🟢 P3 polish / follow-up.

| # | Severity | Area | Issue | Seen in | Proposed fix |
| --- | --- | --- | --- | --- | --- |
| 1 | 🚩 P1 | `deriveDefaultWorkflow` | When the schema has form fields but NO `self` signature block, all fields get dumped onto the first non-pre-signed step — which is often `counterparty`. User sees "Step 1 of 1: Counterparty reviews and signs" when they're the filer. | Doc 1 (DBA Certificate) | `src/lib/workflow/derive.ts`: if there are form fields but no `self` block, synthesize a `"self"` "Fill and sign" step at order 0 before the counterparty steps. |
| 2 | 🟡 P2 | `AgreementSchema` / prompt | No way to express "this field is filled by step N" — all fields attach to step 0 by default. Notary/clerk-filled fields get dumped onto the filer's step. | Doc 1 (DBA Certificate) — `notary-appeared-name`, `notary-date` | Add optional `filledByRole: SignerRole` (or `stepHint: string`) to `AgreementField`. Teach extract/verify prompts to populate it. Workflow derivation assigns fields to matching step. |
| 3 | 🟢 P3 | Schema pattern | Signature-type fields INSIDE a FieldGroup template (e.g. one signature per owner row in a DBA) render fine but aren't tracked as signature blocks. Phase E signature capture needs to handle both top-level `signatureBlocks` AND `type: "signature"` fields inside groups. | Doc 1 (DBA Certificate) | Phase E planning consideration — either lift grouped signatures into `signatureBlocks` with an `instanceOf` reference, or teach the capture UI to handle both shapes. |
| 4 | 🟡 P2 | FormRenderer / schema | Documents with many fields across semantically distinct sections (Contact Info / Plan / Specialized Services / Payment) render as a flat wall of 100+ inputs with no visual grouping. NOT a `FieldGroup` case — those are repeating anonymous rows; this is labeled rows within a semantic section. | Doc 2 (TruGreen — 111 fields) | Add optional `section?: string` to `AgreementField` (free text). Teach the extract prompt to populate it. FormRenderer groups by `section` and renders `<h2>` headings. Null section = standalone (no regression on simpler docs). |
| 5 | 🟡 P2 | Ingest / schema / UI | No support for multi-page physical documents captured as N phone images. A 4-page lease photographed as 4 images currently has no path to be treated as one agreement. User-expected behavior for a real-world agreement engine. | Raised by David 2026-04-23 | `/api/ingest` accepts multiple files; storage uses `sources/{id}/page-{N}.{ext}`; DB gets `source_paths_json` array (additive migration); vision pipeline sends N image blocks to Opus with a page-order instruction. Single-file agreements keep working via read shim. `positionHint.page` already exists in the schema — no Phase D rendering changes needed. |
| 6 | 🟢 P3 | UI | On mobile, `capture="environment"` is already wired so the rear camera IS accessible via the file picker. But a dedicated "Take Photo" button and multi-photo capture session would be a cleaner UX — fits naturally with Issue #5. | Raised by David 2026-04-23 | Separate `<input type="file" capture multiple>` alongside the drag-drop zone; styled as a camera button. Pairs naturally with multi-page ingestion so the user can capture N pages in one camera session. |
| 7 | 🟢 P3 | FormRenderer | When most fields are low-confidence (poor-quality source), showing N individual amber badges may read as "something's broken" rather than "source was blurry, double-check values." | Doc 4 (Termite Policy — 9/14 low-conf) | If >50% of fields are flagged, replace per-field badges with a single form-top banner: *"This document was extracted from a low-quality source. Please double-check values as you fill."* Or surface the overall confidence score in the header. |

---

## Doc 1 — Texas DBA Certificate of Ownership

| | |
| --- | --- |
| short_id | `-etbDYs17d` |
| Source | Phone image |
| Title extracted | Assumed Name Records - Certificate of Ownership for Unincorporated Business or Profession |
| Doc type | Assumed Name Certificate (DBA) |

**What Opus produced:**

- **10 flat fields** (business-name, address, city, state, zip, period, business-type radio, business-type-other, notary-appeared-name, notary-date)
- **1 FieldGroup** `Names of Owners` with template `{owner-name, owner-signature, owner-address, owner-zipcode}`, 3 instances
- **2 signature blocks**, both `signerRole: "counterparty"` (Notary Public + Deputy County Clerk)
- **1 `all-or-none` constraint** — business-type ↔ business-type-other (semantically correct)
- **3 low-confidence fields** flagged
- **5 workflow hints** including good real-world routing notes

**Wins:**

- ✅ Radio collapse worked on the 5-option business-type question
- ✅ FieldGroup emerged cleanly for the repeating owners table
- ✅ `all-or-none` constraint with correct semantic message
- ✅ Both signature blocks marked `counterparty` (Notary + Clerk are government officials, not filer)
- ✅ No hallucinated fields — two fields that are notary-filled ARE on the schema but correctly flagged low-confidence AND surfaced in `workflowHints` as "completed by officials after submission"
- ✅ Style fingerprint appropriate for a plain government form

**Surfaced Issues:** #1 (workflow derivation bug), #2 (per-step field attribution), #3 (signature field inside FieldGroup).

---

## Doc 2 — TruGreen Service Agreement

| | |
| --- | --- |
| short_id | `_y82eIYLca` |
| Source | Phone image |
| Title extracted | TruGreen Service Agreement |
| Doc type | Lawn Care Service Agreement |

**Scale:** 111 fields, 3 signature blocks, 2 constraints, 7 workflow hints.

**What Opus produced:**

- **111 flat fields** across ~7 semantic sections (Contact Info, Property Info, Marketing Consent, TruGreen Plan, Specialized Services, Tree & Shrub, Authorization/Payment)
- **3 signature blocks** all `signerRole: "self"`: Marketing Call Consent, Service Agreement Authorization, EasyPay Authorization (three separate consents the same customer signs)
- **0 FieldGroups** (correctly — the service rows have distinct labels, not anonymous repeating template)
- **2 `all-or-none` constraints**: PrePay "call me for CC" pair, EasyPay "call me for CC" pair
- **7 workflow hints** capturing real-world document nuance (BRANCH COPY of multi-part form, T&C on reverse, Truth-in-Lending right to cancel, billing address conditional)
- **Style fingerprint:** TruGreen green primary (`#2E7D32`) caught, logo position correct, carbonless-branch-copy footer noted
- **7 low-confidence fields** appropriately flagged (rarely-filled items like invisible fence, handwritten notes)

**Wins:**

- ✅ Workflow derivation correct (role=`self` step 0) — Issue #1 doesn't apply here because self signature blocks exist
- ✅ Service Areas radio collapsed correctly (Front/Back/Sides/Entire as 4 options)
- ✅ Constraints are semantically accurate and useful
- ✅ Multiple same-role signature blocks correctly kept separate instead of forced into a single block
- ✅ Workflow hints caught form-structural details humans would describe

**Surfaced Issues:** #4 (section-level grouping for display).

**Not actually a bug but worth noting:** Opus did NOT force the 17 `{checkbox, notes}` service-option pairs into a FieldGroup, which would have been semantically wrong (each row has its own distinct label). That's the right call — our schema correctly distinguishes "labeled rows in a section" (emit flat) from "anonymous repeating template" (emit FieldGroup). The rendering gap (Issue #4) is real; the schema call was right.

---

## Doc 3 — TruGreen Invoice / Statement of Account

| | |
| --- | --- |
| short_id | `zLFlDauhA3` |
| Source | Phone image |
| Title extracted | TruGreen Invoice / Statement of Account |
| Doc type | invoice-payment-stub |

**What Opus produced:**

- **7 fields** (card-type radio, card number, exp date, amount, name on card, authorized signature, amount paid)
- **1 signature block** `signerRole: "self"` (Authorized Cardholder)
- **1 `all-or-none` constraint** on `[payment-method, credit-card-number, exp-date, name-on-card, authorized-signature]` — "If paying by credit card, all card fields and the authorized signature must be completed together." Semantically accurate and captures the real opt-in rule.
- **4 workflow hints** including "Signature is only required if paying by credit card via this stub; online or check payments do not use the signature line" — exactly the nuance the constraint expresses, stated in human terms.
- **1 low-confidence flag** (`amount-paid`, 80%, correctly annotated)
- **Style fingerprint:** TruGreen leaf-green (`#6CB33F`) caught precisely, Source Sans 3 + IBM Plex Mono typography (actual vendor brand fonts), logo + tagline captured in header, OCR/postal routing barcode noted in footer

**Wins:**

- ✅ Radio collapse on card brand (5 options) — consistent behavior
- ✅ Pre-printed customer name/address correctly identified as "not to be re-collected" in workflow hints (Phase A Florida Pest pattern, holding)
- ✅ Handwritten "Paid via Bank Draft BB&T on 2/2/17" annotation correctly ignored as informational context (Phase A pattern, holding)
- ✅ Dual-purpose doc correctly scoped to just the fillable payment stub (Phase A Carry-On MCO pattern, holding)
- ✅ Constraint is genuinely useful and correctly scoped
- ✅ Workflow derivation correct (role=self, Issue #1 doesn't surface because self sig block exists)

**New issues:** none.

**Minor observation (not a bug):** Opus emitted both a `type: "signature"` field AND a top-level signature block for the same real-world signature line. Field is the capture widget, block is the layout metadata. Most Phase A docs emitted only the block. Worth a schema-docs one-liner noting either/both are valid; the eventual capture UI will need to dedupe. Very low priority — not added to the issues table.

---

## Doc 4 — Subterranean Termite Damage Repair and Retreatment Service Policy (poor-quality pink NCR carbonless photo)

| | |
| --- | --- |
| short_id | `ugFAXD0djo` |
| Source | Phone image — pink NCR carbonless, lower quality |
| Title extracted | Subterranean Termite Damage Repair and Retreatment Service Policy |
| Doc type | Termite Service Policy / Pest Control Agreement |

**What Opus produced:**

- **14 fields** including a broken-apart date (`Issued At (City)`, `Date Issued (Month/Day)`, `Year`), dollar amounts in both words and numbers, radio for treatment type
- **2 signature blocks** — Owner (`signerRole: "self"`) + Second Party (`signerRole: "counterparty"`) — a multi-party form done right
- **Workflow correctly derived 2 steps:** step 0 = self fills + owner signs (14 fields + sig-owner), step 1 = counterparty signs (sig-second-party, 0 fields)
- **0 constraints** (Opus stayed silent, correctly — the only plausible cross-field rule would be "fee in words matches fee in numbers" which is a complex equality constraint not in our MVP set)
- **9 of 14 fields flagged low-confidence** (range 55–80%, vs. clean docs at 75–97%) — calibration degraded appropriately under poor image quality
- **Palette nailed** — `#8a1c1c` dark red on `#f2a89a` salmon pink; style notes caught "preprinted pink carbonless (NCR) form"
- **Workflow hint caught the physical medium:** *"Form is a carbon/NCR pink copy; handwritten entries are expected in the blanks throughout the form."*

**Wins:**

- ✅ **The multi-party workflow derivation works** when both self and counterparty signatures exist. Issue #1 is specifically the subset "no self signature block." Confirmed scope.
- ✅ **Graceful degradation on poor quality** — lower confidence, more fields flagged, BUT no hallucinations, no missed fields, no schema corruption
- ✅ **Style fingerprint survived the poor quality** — pink palette accurate, Times New Roman body typography correct, NCR carbonless noted
- ✅ **Odd date decomposition handled** — the "at ___, this ___ day of ___, 20___" physical blanks correctly modeled as three separate fields
- ✅ **Radio collapse** still working (Pre-construction / Post-construction)

**New issue surfaced:** #7 (confidence-badge UX when many fields are flagged).

---

# Wave 2 — post-PR-#9 validation against the cleaned stack

Two additional documents run through the fully-merged Phase C pipeline to confirm the Wave 1 fixes hold and to exercise the new multi-page ingestion path. This wave also surfaced 4 form-pipeline bugs that went into PR #10.

## Doc 5 — Bicycle Purchase Agreement (synthetic 3-page test, generated by `scripts/generate-test-multipage.ts`)

| | |
| --- | --- |
| short_id | `l82iw9QqpL` |
| Source | 3 PNG pages uploaded as one agreement |
| Title extracted | Bicycle Purchase Agreement |
| Doc type | Bicycle Purchase Agreement |

**What Opus produced:**

- **36 fields across 11 sections** (Agreement / Buyer / Buyer Information / Bicycle Description / Sale Terms / Payment Method / Condition and Warranty / Buyer Acknowledgements / Seller / Seller Information / Witness (Optional))
- **3 signature blocks:** Buyer (`signerRole: "self"`), Seller (`signerRole: "counterparty"`), Witness (`signerRole: "co-signer"`)
- **3-step workflow:** self (26 fields + 1 sig) → co-signer (3 fields + 1 sig) → counterparty (7 fields + 1 sig). Fields correctly routed by `filledByRole` — e.g. Seller-provided fields went to the counterparty step, not the filer's.
- **2 constraints** emitted
- **Radio collapse** on Payment Method (Cash / Check / Bank Transfer / Other)

**Wins:**

- ✅ **Multi-page ingestion works end-to-end** — 3 separate PNG pages correlated as one agreement by Opus's "Page X of N:" prompting
- ✅ **Section discovery on an unseen synthetic doc** — 11 sensible sections matching the HTML headings
- ✅ **filledByRole routing** splits fields correctly across the 3-step workflow
- ✅ **Co-signer role interpretation** — Witness interpreted as co-signer (same side as Buyer), not counterparty. Defensible either way; the model chose the warmer reading.
- ✅ **Form submitted successfully end-to-end** with 30 of 36 fields filled ("Ricky Bobby" buying a 1989 Huffy Lightning from "Bobby Buchett" — test data ✓)

**New issues surfaced during this test:** several form-pipeline bugs that fed into PR #10.

## Doc 6 — Service Contract (real 1-page PDF David uploaded)

| | |
| --- | --- |
| short_id | `N-DvD6gFJN` |
| Source | Single PDF, 1 page |
| Title extracted | Service Contract |
| Doc type | Service Agreement |

**What Opus produced:**

- **32 fields across 10 sections** (Parties / Services / Term / Payment Amount / Payment Method / Retainer / Termination / Governing Law / Additional Terms / Signatures)
- **2 signature blocks:** Client (`signerRole: "self"`) + Service Provider (`signerRole: "counterparty"`) — clean
- **2-step workflow:** self (29 fields + 1 sig) → counterparty (3 fields + 1 sig)
- **🎯 5 semantically-correct constraints** — the standout signal of this run:
  1. `at-least-n`: at least one payment amount option (Per Hour / Per Job / Other) must be selected
  2. `all-or-none`: retainer amount ↔ refundability specification
  3. `all-or-none`: "Per Hour" checkbox ↔ hourly rate provided
  4. `all-or-none`: "Per Job" checkbox ↔ per-job amount provided
  5. `all-or-none`: "Other" checkbox ↔ description provided

**Why this matters:** 5 constraints on a single fresh document, all passing the semantic-homogeneity rule, all capturing real legal-doc completion logic. Strongest validation yet that the constraint-inference work in PR #8 is producing genuinely useful rules on docs Opus hadn't seen during prompt tuning.

**Wins:**

- ✅ **PDF ingestion path unchanged** under the new multi-file API (PDFs ride the single `document` block; no regression)
- ✅ **Constraint inference is MVP-useful** — 5 of them on one doc, all correct
- ✅ **Multi-party workflow on a real PDF** — 2-step derivation correct, fields routed by `filledByRole`
- ✅ **Form submitted successfully** with 25 of 32 fields filled

**New issues surfaced during this test:** same form-pipeline bugs as Doc 5 → all went into PR #10.

---

# PR #10 — post-merge fixes (bugs surfaced by Wave 2)

Four bugs that only manifested when actually using the fully-merged Phase C pipeline. All landed in PR #10 via cherry-pick after a merge-timing race meant they didn't ride PR #9 into main.

| Bug | Severity | Fix commit | Summary |
| --- | --- | --- | --- |
| `/api/submissions` returns `body.fieldErrors` but client only showed top-line message | 🟡 P2 | `65829f5` | Wire `setError` from per-field server errors; first-failure auto-focus; count-aware grammar-correct top-line summary |
| After failed submit, `pauseAutoSave` stuck `true` — corrections didn't save | 🟡 P2 | `65829f5` | Reset `pauseAutoSave(false)` on every failure path (network error, 422, non-2xx) |
| After partial fix + resubmit, Submit was a silent no-op | 🚩 P1 | `4c193ff` | `clearErrors()` on submit attempt + per-field `clearErrors` on edit so react-hook-form doesn't gate on stale `setError` errors |
| `type: "signature"`/`"initials"` fields with `required: true` blocked every submit (Phase E placeholder, can't be filled yet) | 🚩 P1 | `9524b00` | Skip `required` enforcement for signature/initials types in `fieldToZod`. Same conceptual fix as workflow's treatment of unsigned signatureBlocks. Revisit when Phase E ships. |

Plus two UX improvements David flagged while validating:

| Commit | Type | Summary |
| --- | --- | --- |
| `145bb3b` | chore | `scripts/generate-test-multipage.ts` — synthetic 3-page Bicycle Purchase Agreement generator using Puppeteer (used to produce Doc 5) |
| `6525351` | feat | Up/down reorder buttons on each page thumbnail in `/ingest` so misordered uploads can be fixed without "Clear all" |
