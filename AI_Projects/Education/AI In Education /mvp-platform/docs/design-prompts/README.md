# Claude Design — handoff prompts

Four ready-to-paste prompts for redesigning the Mwalimu teacher interface in
Claude Design (claude.ai). Use them **one page at a time, in the same chat**, so the
token system and component language stay consistent across pages.

## Workflow

1. Open a new chat at **claude.ai**.
2. **Attach two things** with the first prompt:
   - `docs/teacher-interface-design.md` (the full brief — tokens + principles)
   - The current-state screenshot of the page you're redesigning.
3. Paste the matching prompt file below.
4. Approve / iterate. When happy, move to the next file in the **same chat** and say
   "next page" — it will reuse the tokens it already set up.

Order: `01-dashboard` → `02-class-detail` → `03-insights` → `04-studio`.

## Hard rules (repeated in every prompt)

- Use only the design tokens in §2 of the brief — indigo `#4f46e5` primary, the
  semantic status colors, Lexend (headings/numbers) + Inter (body). Define them as
  CSS variables; no new colors/fonts.
- French copy, matching the tone in the screenshots.
- Offline-first: single self-contained HTML file, **no external CDNs**, SVG charts
  only.
- Responsive per §6 of the brief. Accessible per §7 (status never color-only, visible
  focus rings, ≥4.5:1 contrast, 40px tap targets).
