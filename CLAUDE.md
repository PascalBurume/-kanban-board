# gstack

This project uses [gstack](https://github.com/garrytan/gstack) for browsing, QA, review, and shipping workflows.

## Install

```
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack \
  && cd ~/.claude/skills/gstack && ./setup
```

Requires [Bun](https://bun.sh) (`brew install oven-sh/bun/bun`). Setup links the skills, compiles the browse daemon, and downloads Playwright Chromium.

## Browsing

Use the `/browse` skill from gstack for **all** web browsing — page loads, screenshots, console/network inspection, form interaction, and QA of local or deployed sites.

**Never use the `mcp__claude-in-chrome__*` tools.** If a task looks like it needs browser automation, reach for `/browse` (or `/connect-chrome` for a live Chromium session) instead.

## Available gstack skills

Planning & review
- `/office-hours` — YC-style product/idea interrogation
- `/autoplan` — run the CEO/design/eng/DX plan reviews back-to-back with auto-decisions
- `/plan-ceo-review` — founder-mode plan review
- `/plan-eng-review` — eng manager-mode plan review
- `/plan-design-review` — designer's eye plan review
- `/plan-devex-review` — developer experience plan review
- `/review` — code review
- `/retro` — engineering retrospective
- `/investigate` — systematic debugging with root cause analysis

Design
- `/design-consultation` — propose a full design system with font + color previews
- `/design-shotgun` — generate design variants and compare them on a board
- `/design-html` — production-quality HTML/CSS from the chosen direction
- `/design-review` — visual QA: spacing, hierarchy, AI slop patterns

Browser & QA
- `/browse` — headless browser for QA and site dogfooding (the default for web work)
- `/connect-chrome` — launch GStack Browser (AI-controlled Chromium with sidebar extension)
- `/qa` — systematically QA a web app and fix the bugs found
- `/qa-only` — same sweep, report-only, no fixes
- `/setup-browser-cookies` — import real browser cookies into the headless session
- `/benchmark` — performance regression detection via the browse daemon

Shipping
- `/ship` — merge base, run tests, review diff, bump VERSION, changelog, commit, push, PR
- `/land-and-deploy` — land and deploy
- `/canary` — post-deploy canary monitoring
- `/setup-deploy` — configure deployment settings for `/land-and-deploy`

Docs
- `/document-release` — post-ship documentation update
- `/document-generate` — generate missing docs for a feature, module, or project

Safety
- `/careful` — destructive command guardrails
- `/freeze` — restrict edits to one directory for the session
- `/unfreeze` — clear the freeze boundary
- `/guard` — full safety mode (careful + freeze)
- `/cso` — Chief Security Officer mode

Meta
- `/codex` — OpenAI Codex CLI wrapper
- `/devex-review` — live developer experience audit
- `/setup-gbrain` — set up gbrain (persistent project brain) for this agent
- `/learn` — manage project learnings
- `/gstack-upgrade` — upgrade gstack to the latest version
