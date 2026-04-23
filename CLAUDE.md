@AGENTS.md

# Signflo — project context

**What this is.** OSS Agreement Engine. Phone photo or digital PDF → structured schema → live signable agreement → ownable self-hostable repo. Built in public the week of 4/21–4/27 2026 as a clean-room response to the Anthropic "Built with Opus 4.7" hackathon.

**Epic:** CPG-176 in `droyes.atlassian.net` (Idea Manager project).
**Plan of record:** `~/.claude/plans/you-and-i-drafted-functional-bengio.md` (the approved catch-up plan).

## Stack — locked

- **Framework:** Next.js 16 (App Router, src/ layout) + TypeScript strict + Tailwind v4
- **Vision/agent:** `@anthropic-ai/sdk` calling Claude Opus 4.7
- **DB:** SQLite via `better-sqlite3` + Drizzle ORM (local file at `./data/signflo.db`). Swap-ready for Cloudflare D1 later.
- **Storage:** Local filesystem under `./uploads/`, behind a `Storage` interface. Swap-ready for R2.
- **PDF ingestion:** `pdfjs-dist` (pure-JS, legacy build import on server)
- **PDF rendering:** Puppeteer headless, rendering Opus-generated HTML/CSS
- **Signatures:** `signature_pad` canvas → PNG → embedded
- **Repo export:** zip via `archiver`

## Working agreements

- **Local-first.** No Cloudflare deploy yet. Do not provision Workers/D1/R2 without discussion.
- **High-fidelity rendering.** Generated agreements must visually resemble the original. "Looks like the same document, just signable" is the acceptance bar.
- **Swap-ready abstractions.** DB and Storage behind interfaces so the Cloudflare port is a driver change, not a rewrite.
- **No PGA TOUR IP.** This is a personal clean-room project; keep test corpus and code free of PGA TOUR assets.

## Style

- Semantic commit format: `<type>(<scope>): <subject>` with narrative WHY in the body.
- Work on local branch → PR to `main` when appropriate. Do not commit directly to `main` once the PR flow starts.
- Mask secrets in any conversation output.
- Run the dev server and test in browser before declaring UI work done.

## Key paths

- `src/app/ingest/` — upload + schema preview UI
- `src/app/a/[shortId]/` — public agreement form (Phase B)
- `src/app/api/ingest/route.ts` — upload + vision orchestration
- `src/lib/vision/` — Opus 4.7 calls (schema extraction, style fingerprint, self-verify)
- `src/lib/pdf/` — ingestion (pdfjs-dist) + rendering (Puppeteer)
- `src/lib/db/` — Drizzle schema + client
- `src/lib/storage/` — Storage interface + LocalStorage impl
- `docs/adr/` — architecture decisions
- `docs/vision-spike.md` — Phase A test-corpus results

## Before writing code in Next.js files

Per `AGENTS.md`: Next.js 16 has breaking changes from earlier versions. Read `node_modules/next/dist/docs/` before touching App Router conventions, route handlers, or data fetching.
