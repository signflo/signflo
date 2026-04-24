# Phase C.4 — Form drafts decisions

Scope: debounced auto-save while a user fills out a form; resume via the same bearer-token URL; draft → submitted transition keeps the same token so bookmarks don't rot.

The hero story this enables: *snap a photo at lunch → start filling → phone dies → come back after dinner at `/s/{token}` → keep typing → submit when ready.*

---

## 1. Separate `/api/drafts` endpoint rather than overloading `/api/submissions`

**Decision:** Drafts have their own route (`POST /api/drafts`) with distinct semantics: JSON body (not multipart), no Zod validation, no workflow transition, no file uploads, no status changes past "draft." `/api/submissions` handles the final submit path and the draft → submitted transition via an optional `draftToken` field.

**Alternative considered:** Parameterize `/api/submissions` with a `save: "draft" | "final"` flag.

**Why separate:**
- Draft saves happen 10–20× per session while the user types; final submits happen once. Different volume, different cost profiles.
- Draft saves bypass validation by design; final submits enforce it. Route-level separation makes the contract obvious.
- Content type differs — drafts are simple JSON round-trips, final submits are multipart for files.

**What's shared:** both routes use the same `submissions` table and the same `submission_tokens` mechanism. Only the state transitions differ.

---

## 2. Token minted on **first** save, not on form mount

**Decision:** Mounting the form doesn't touch the database. The first debounced save (after the user types anything) creates the submission row with `status = "draft"` and mints an owner token. Subsequent saves update in place.

**Alternative considered:** Create a draft row eagerly on mount (so a token exists from the first pixel).

**Why lazy:**
- No zombie drafts from users who bounce before typing anything. The Phase-A `/ingest` flow already creates an agreement row — we don't need an empty submission row for every page view.
- Makes `/a/{shortId}` cheap to render — it stays a pure read operation. Good for performance, good for analytics (a load doesn't imply intent).

**Trade-off:** the user doesn't have a shareable draft URL until after they've typed something. Acceptable — nobody shares a blank draft.

---

## 3. URL rewrites to `/s/{token}` after first save — no navigation, no refresh

**Decision:** After the first successful debounced save, `useDraftSave` calls `history.replaceState({}, "", ownerUrl)`. The user's address bar changes from `/a/{shortId}` to `/s/{token}` without a navigation event, page reload, or form state reset.

**Alternative considered:** Keep the user on `/a/{shortId}` and only transition to `/s/{token}` on final submit.

**Why rewrite immediately:**
- If the phone dies mid-fill, the URL in the address bar is the exact recovery URL. "Close tab → reopen browser history → continue" becomes the muscle memory.
- Sharing mid-fill becomes meaningful (e.g. "hey spouse, co-sign this please") once bookmarks point at the draft itself, not at the form.
- `history.replaceState` (not `pushState`) means the back button still does what the user expects — it returns to wherever they came from, not to an empty form.

**What NOT to do:** don't use `pushState` here. Creating history entries every time a token is minted would clutter the back button and could race with the user navigating away.

---

## 4. Debounce interval: 1500ms of inactivity

**Decision:** Auto-save fires 1.5 seconds after the last keystroke / blur / change event.

**Why 1.5s:**
- Shorter (500–1000ms) causes per-character saves on a slow typist and hammers the server.
- Longer (3000ms+) makes "save on blur" feel sluggish — if the user tabs to the next field and immediately closes the tab, they should have ~1.5s of safety.
- 1.5s matches the typical cadence of research-backed auto-save implementations (Google Docs, Notion, Linear).

**Future optimization:** save on blur for fast feedback on completing a field, but keep the debounce for mid-typing. Not MVP.

---

## 5. Last-write-wins, no version vectors or conflict detection

**Decision:** Each save posts the full form state. If two tabs edit the same draft concurrently, the later `setTimeout` fires last and its values overwrite the earlier ones.

**Alternative considered:** version vectors, optimistic concurrency control, CRDTs.

**Why LWW:**
- Drafts are personal. One user on two tabs is a corner case; two users on one draft is an even rarer corner case that requires actively sharing the bearer token mid-fill.
- Conflict resolution UI is a real design problem that isn't worth solving for this scope.
- Final-submit-time validation catches the worst case: if the "winning" state is actually invalid, the user will see the field errors and correct.

**What we accept:** a rare "I thought I typed that" moment if someone opens two tabs, types in each, and only one wins. The trade-off is vastly simpler code.

---

## 6. File fields skip draft save; only persist on final submit

**Decision:** When the form has `type: "file"` fields, the auto-save POST payload does NOT include file contents. Files are only written to `LocalStorage` by `/api/submissions` at final submission time.

**Why:**
- Base64-encoding files into a JSON draft save would blow up the wire payload (10× overhead, easily 50MB+ for a casual phone photo).
- Multipart uploads per debounced save would hammer the server with big body parses every 1.5 seconds.
- A file is conceptually "the thing you chose at submit time," not "the thing you were figuring out." A user choosing-then-unchoosing a file through a draft lifecycle isn't a realistic flow.

**Trade-off:** if the user picks a file, types the rest of the form over a few minutes, the file is still in their browser's `<input>` element when they submit (since the input element state persists across debounced re-renders). They don't have to re-pick. But if they RELOAD the page via `/s/{token}` resume, the file picker is cleared and they need to pick again.

**How to improve later:** a lightweight metadata save for file picks (name, size, type) + show "attached earlier: filename.pdf" on resume, with a "re-attach to submit" affordance.

---

## 7. Draft → submitted keeps the **same token** and the **same submission row**

**Decision:** When `/api/submissions` receives a `draftToken` field, it updates the existing draft row in place (not a new row) and returns the same token in the response's `ownerUrl`. The bookmark the user has keeps working forever.

**Alternative considered:** On submit, create a new submission row referencing the draft and issue a new token for the submitted version.

**Why same token:**
- The URL is the credential. Rotating it on submit would require the user to bookmark the "new" URL — which they won't — and their old URL would return a confusing 404.
- One submission, one lifecycle: `draft → submitted → signed`. That's one row with evolving status, not three rows.
- Audit/history is cleaner when the submission id is stable across state transitions.

**Security note:** because the draft token persists past final submission, a bad actor who saw the token during the draft phase retains access after submission. Acceptable for the same reason we trust tokens in the first place — the URL is the credential, and sharing the URL is the only way to share access.

---

## 8. Auto-save pauses during final submit + after final submit

**Decision:** `FormRenderer` sets `paused = true` on the `useDraftSave` hook when `isSubmitting` is true, so a debounced save can't race the final `POST /api/submissions`. After the final submit succeeds, the redirect to `/s/{token}` read-only view unmounts the form.

**Why:**
- Without pausing, a late-firing debounce after the user clicks Submit could overwrite the "submitted" row with a "draft" save, putting the submission back into draft status.
- Pausing is simpler than canceling pending timers.

---

## What's explicitly NOT in Phase C.4

- **Collaborative editing** — drafts are single-owner; no presence indicators or OT/CRDT.
- **File draft metadata** — see #6 above.
- **"Saving..." / "Saved" toast in the corner** — we show a low-key inline indicator above the Submit button; no floating UI.
- **Offline-capable drafts (IndexedDB mirror)** — out of scope for MVP; Phase G maybe.
- **Auto-expire unfinished drafts** — drafts live as long as their token; TTL becomes relevant at production scale but not for solo-dev.
- **Resume from browser storage** — token is the only resume mechanism. If the user loses the token URL, the draft is lost. That's intentional — don't smuggle the token into localStorage under the rug where it could leak.

---

## Open questions for David

- The draft URL is your authority proof. Are you OK with the UX of "please bookmark this URL and don't share it carelessly" as the primary affordance, or do we want a prominent "Save this URL — email it to yourself" banner for first-time users?
- Debounce at 1500ms feels right for typing; does it feel right on mobile where a form field might get a long accidental press? Test on actual mobile before we decide.
- If a draft sits for a month with no saves, do we care? Currently it lives forever. Adding an `updated_at` column + a cleanup cron would be trivial if we decide on a TTL — but I'd bias toward keeping drafts indefinitely for MVP.
