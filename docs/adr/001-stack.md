# ADR 001 — Stack decisions (Day 0)

**Status:** Accepted
**Date:** 2026-04-23
**Deciders:** David Royes (solo)

## Context

Signflo is built solo in public during the week of 4/21–4/27 2026 (Anthropic "Built with Opus 4.7" hackathon window). The stack must prioritize:

1. **Velocity** — one person, one week.
2. **Local-first execution** — ship a working local demo before any Cloudflare deploy.
3. **Hero capability clarity** — phone-photo → agreement → signable PDF + ownable repo.
4. **Fidelity** — generated agreements must visually resemble the originals.

## Decisions

| Area | Decision | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + TypeScript strict + Tailwind v4 | Fastest path for one-person full-stack; App Router + route handlers serve both UI and API |
| DB (local) | SQLite via `better-sqlite3` | Zero external deps, synchronous writes acceptable for dev, file-as-database |
| ORM | Drizzle | Same schema targets `better-sqlite3` locally and Cloudflare D1 later — swap is a driver change |
| File storage (local) | Local filesystem under `./uploads/` behind a `Storage` interface | Simple; the interface lets us swap to R2 when we deploy |
| Vision | `@anthropic-ai/sdk` calling Claude Opus 4.7 with tool-use structured output | Epic locks this as the hero capability |
| Vision preprocessing | Raw first; add `sharp`-based deskew/contrast only if measured failure rate demands | Matches epic risk-mitigation: "don't chase before measuring" |
| PDF ingestion (digital) | `pdfjs-dist` (legacy build import on server) — extract text layer + rasterize first 1–3 pages, feed both to Opus | Pure-JS (no poppler/system deps); gives vision both text and image for maximum signal |
| Image ingestion (phone photo) | Direct to Opus 4.7 vision (jpg/png/heic) | Hero demo path |
| Style fingerprint | Second vision pass extracts fonts, header/footer, logo regions, clause numbering, color palette, signature-block layout | Drives high-fidelity rendering per-document |
| PDF rendering | Puppeteer headless, rendering Opus-generated HTML/CSS | Best fidelity control; plays to Opus 4.7's tasteful output; swap to `@cloudflare/puppeteer` or Paged.js later if needed |
| Signature | HTML `<canvas>` via `signature_pad` → PNG → embedded in post-render pass | Per epic; no DocuSign integration in MVP |
| Repo export | zip of a pre-scaffolded template populated at export time, via `archiver` | Per CPG-182 MVP path; GitHub OAuth push = stretch |
| Agent runtime | Server-side (Next.js route handlers) | Simpler to debug; stream to client for UX later |
| License | MIT | Per epic — "an agreement you can't own isn't really yours" |

## Deferred — will revisit before Cloudflare deploy

- Puppeteer in Workers runtime: requires `@cloudflare/puppeteer` or Paged.js swap.
- Drizzle → D1: driver change; budget ~2 hours for the port.
- `pdfjs-dist` in Workers: may need alternative if the legacy server build isn't compatible.
- Storage SDK: replace `LocalStorage` implementation with R2 SDK; keep the interface stable.

## Rejected alternatives

- **pnpm** — not a fit for a one-person project with no global install. Using `npm` keeps onboarding zero-friction.
- **react-pdf** — React-primitives-only; poor fidelity to arbitrary source documents.
- **Single fixed agreement template** — original plan was one opinionated template; changed to per-document rendering after David's high-fidelity requirement.
- **DocuSign integration** — explicit non-goal for MVP per epic.
- **Multi-tenancy / auth** — explicit non-goal for MVP per epic.
