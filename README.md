# # Signflo

**Point your phone at any document, describe how it should work, get back a
live signable agreement — plus the repo that powers it, yours forever.**

🚧 **Being built in public, week of April 21–27, 2026.** No safety net.
Follow along: [daily build log](./BUILD_LOG.md)

🔗 **Live:** [signflo.dev](https://signflo.dev) (coming soon)

---

## The Thesis

Form builders exist. They're fine. The real pain isn't creation — it's the
gap between *"form submitted"* and *"authoritative, signed, routed,
enforceable agreement."*

Signflo closes that gap with an agentic runtime powered by Claude Opus 4.7,
and because every agreement is generated **as code you own**, there's no
SaaS lock-in.

## Three Pillars

1. **Ingestion** — Phone photo or digital doc → structured schema → live form.
2. **Output polish** — Authoritative agreement styling, not raw-form look.
3. **Agentic UX** — Conversational refinement, not drag-and-drop.

## Why This Exists

I spent the past year building enterprise form tooling at PGA TOUR. Along
the way I saw the ceiling on what traditional form builders can do, and I
saw what became possible when Claude Opus 4.7 shipped. This is my attempt
to rebuild the concept from scratch, with the capabilities I wished I'd
had from day one.

Anthropic ran a "Built with Opus 4.7" hackathon the same week. Applications
closed the day before I found out. So I'm building it anyway, in public,
on the same timeline, with Claude Code as my copilot and Opus 4.7 as the
runtime engine.

## Stack

- **Frontend:** Next.js 15, Tailwind, TypeScript
- **Backend:** Cloudflare Workers + D1 + R2
- **Agent:** Claude Opus 4.7 (via Claude Code during build, direct API at runtime)
- **PDF:** TBD during Day 0 architecture spike
- **License:** MIT

## Roadmap (Week 1)

- [ ] **Day 0** (Mon 4/20) — Setup, architecture, public kickoff
- [ ] **Day 1** (Tue 4/21) — Phone photo → structured schema
- [ ] **Day 2** (Wed 4/22) — Schema → live interactive form
- [ ] **Day 3** (Thu 4/23) — Authoritative agreement template + PDF
- [ ] **Day 4** (Fri 4/24) — Signature capture + publish flow
- [ ] **Day 5** (Sun 4/26) — Repo export (the differentiator)
- [ ] **Day 6** (Mon 4/27) — Demo + launch

## Contributing

Not yet — building the foundation first. After launch (Apr 28), issues and
PRs welcome.

## License

MIT. Because an agreement you can't own isn't really yours.
