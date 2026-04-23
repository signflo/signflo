# Phase C.3 — URL-as-bearer-token ownership decisions

Scope: per-submission private access without accounts, passwords, or logins. Anyone holding the `/s/{token}` URL has owner access to that submission; anyone without it does not. Same security model as DocuSign envelope links, Calendly booking URLs, or unlisted Google Docs.

---

## 1. Storage: separate `submission_tokens` table, not a column on `submissions`

**Decision:** New `submission_tokens` table with `token` as the primary key, `submission_id` FK, `role` enum (default `"owner"`), and `created_at`.

**Alternative considered:** A single `owner_token` column on the `submissions` table.

**Why a separate table:**
- Multiple tokens per submission becomes cheap. Phase F or later might want viewer tokens that only see the final PDF, or reviewer tokens that can send-back-with-notes but not modify submission data.
- Token rotation (regenerate owner, keep submission) is an insert + delete, no row mutation.
- Revocation (add a `revoked_at` column later) doesn't require touching the submissions row.
- Access-log joins are natural — a future `token_access_log` table FKs to `submission_tokens.token` without submission-row changes.

**Cost:** one extra join on the `/s/{token}` lookup path. Negligible.

---

## 2. Token strength: 24 random bytes → 32-char base64url (~192 bits entropy)

**Decision:** `crypto.randomBytes(24).toString("base64url")` yields a 32-character URL-safe string.

**Why 192 bits:**
- DocuSign envelope IDs are 128 bits, Calendly booking hashes are ~120 bits, unlisted Google Doc IDs are ~44 characters base64 (~260 bits). 192 bits puts us comfortably in the "not brute-forceable" range without an over-long URL.
- 32 characters fits in a QR code at reasonable density and reads aloud in 6 seconds — practical for in-person agreement hand-offs.
- Node's `crypto.randomBytes` is a CSPRNG, not `Math.random`. Non-negotiable for anything acting as a secret.

**What this is NOT:** the token is not a password you can hash-and-forget. It's a bearer credential. The raw value is stored in the DB because lookups happen by equality. This is the same tradeoff as session cookies, API keys, email-magic-link tokens, etc.

---

## 3. Token is issued **once**, at submission creation, and surfaced **once** in the API response

**Decision:** `/api/submissions` mints an owner token during the successful-submit path and returns it as `ownerUrl: "/s/{token}"` in the JSON response. The client redirects to that URL and treats it as the user's private reference.

**Alternative considered:** Return the raw token as a separate field and have the client construct the URL. Or issue via a separate endpoint.

**Why URL-shaped:**
- Prevents the client from doing anything else with the raw token value (e.g. logging it, storing in analytics). The URL is what the user uses; the token is effectively inside it.
- If we ever change the route shape (`/s/{token}` → `/owner/{token}` or similar), the API controls the canonical form.

**Security boundary:** the raw token is in the API response body exactly once. It is NOT in:
- Access logs (we only log the request path, and the framework's default logger truncates query strings and route params — but keep an eye on this when real logging lands)
- Error messages
- Any downstream DB write besides `submission_tokens.token` itself
- The `/s/{token}` page rendering (the URL is in the address bar but we don't render the token in the page body, except implicitly in the footer link-sharing warning)

**In Phase C.2 smoke-test output the token appears in transcripts.** Acceptable for local dev. Production logging (Phase G+) needs to scrub token values from access-log entries.

---

## 4. Single role in MVP — `"owner"` — but the enum is ready for expansion

**Decision:** Token's `role` column is an enum `"owner" | "viewer" | "reviewer"` today; only `"owner"` is ever issued in MVP.

**Future paths the shape supports:**
- **Viewer tokens** (read-only share link) — let the submission owner generate a view-only URL for a reviewer without giving away edit/resubmit power.
- **Reviewer tokens** — can add notes and trigger a rework transition (Phase E+), but cannot modify field data.
- **Expiring tokens** — add `expires_at` nullable column, enforce in `getTokenContext`.

**Why not MVP these now:**
- Nobody needs a viewer-only share for a single-signer self-sign flow.
- Reviewer workflows only make sense once multi-step workflows have UI, which is post-MVP.
- Adding these later is an additive column + a route-handler check, not a redesign.

---

## 5. 404 on invalid token — no distinction between "not found" and "wrong token"

**Decision:** `/s/{token}` returns a plain 404 if the token doesn't exist OR if the submission it references is gone.

**Alternative considered:** Distinguish "token revoked," "token expired," "submission deleted" with different error messages.

**Why uniform 404:**
- Eliminates an enumeration oracle. An attacker probing tokens can't tell if they're guessing a never-existed token vs. a revoked-but-existed one.
- Simpler code path — `notFound()` in Next.js is a single idiomatic action.

**When we add expiration (Phase F+):** expired tokens should still 404, but the submission owner's existing valid token (if re-minted) should continue to work. Token lifecycle is per-token, not per-submission.

---

## 6. No timing-safe comparison in MVP

**Decision:** Token lookup uses a standard `WHERE token = ?` SQL query, not `crypto.timingSafeEqual`.

**Why acceptable:**
- SQLite is constant-time-enough for an equality lookup on a primary-key index. The variance between a hit and a miss is dominated by filesystem I/O and query overhead, not the string comparison itself.
- 192 bits of entropy makes timing-based brute-force impractical even if the comparison WERE variable-time — an attacker would need roughly 2^96 requests to get a meaningful statistical signal, at which point they'd hit far bigger problems (rate limits, logging, etc.).

**When this matters:** if we ever move to a compromise scenario where the attacker has seen partial leaks and is trying to confirm a specific token, timing-safe comparison becomes relevant. Trivial to add — wrap the lookup in `crypto.timingSafeEqual` once we have the DB row.

---

## 7. The owner URL is displayed in the page as a warning, not auto-copied to clipboard

**Decision:** `/s/{token}` renders a footer disclaimer reading:

> *This URL is your private access link. Anyone with it can view this submission — share carefully.*

No auto-clipboard-copy, no "Email me this link" button in MVP.

**Why:**
- Clipboard access requires user permission flow on secure contexts and is brittle on mobile Safari.
- Email/SMS integration is a dedicated feature (Phase G or a notifications layer) — not trivial scope, needs Resend or similar.
- The most important thing is the user understanding the token is the credential. Plain-text warning is more useful than a magic share button.

**Future:** a share-picker that can send via email/SMS lives with the broader notifications work.

---

## 8. The existing `/a/[shortId]/complete` page stays as a fallback

**Decision:** If the API ever returns a response without `ownerUrl` (token minting failed, legacy client, etc.), the FormRenderer falls back to `/a/{shortId}/complete?submission={id}`.

**Why:**
- Robustness against future regressions.
- Keeps the shortId-keyed confirmation path working for the two or three existing Phase B submissions that predate this PR.

**How to remove later:** once we've verified every submission path mints tokens successfully for a few weeks, delete the fallback in `FormRenderer` and point `/a/[shortId]/complete` at the token lookup by reverse-searching `submission_tokens` for the most recent token.

---

## What's explicitly NOT in Phase C.3

- Token expiration / TTL
- Token rotation UI (though the helper supports re-minting)
- Token revocation
- Viewer or reviewer roles in use (enum exists, only owner is issued)
- Share-via-email/SMS flow
- Audit log of token access
- Rate-limiting on `/s/{token}` (brute-force risk is 2^192; rate limits are more about abuse than security)

---

## Open questions for David

- Is the "This URL is your private access link" warning adequate, or do you want a more prominent in-context confirmation (modal, banner, etc.) reinforcing that the URL is sensitive?
- When you share an agreement with your church's elders or a vendor, what's the realistic sharing path — email? WhatsApp? SMS? That drives whether we prioritize a share-picker in Phase G or later.
- Do we want to support the signer re-generating their own owner URL (losing access to the old one) as a self-serve action? Useful if they accidentally over-share. Small addition to the owner view — not in MVP unless you flag it.
