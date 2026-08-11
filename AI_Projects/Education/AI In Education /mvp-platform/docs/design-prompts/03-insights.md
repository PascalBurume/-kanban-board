# Prompt — Copilot Insights (`/teacher/insights`)

> **Attach with this prompt:** the insights screenshot (brief already in this chat).

Now the **Copilot Insights page**, same token system and components. Single
self-contained HTML file, French copy, SVG charts only, no CDNs.

Implement (brief §4.3):

- **Header:** title "Analyses Copilot" + subtitle, with class and period selectors
  top-right (consistent dropdown component: `--border`, chevron, `--r-md`).
- **4 KPI cards:** Questions posées · Élèves actifs · Thèmes d'incompréhension ·
  Heure la plus active. Same KPI card language as the other pages.
- **"Thèmes d'incompréhension" (hero, left column):** one card per theme with a
  left color bar encoding **severity** (rose = many students struggling, amber = some,
  green = minor/resolved), a severity icon, the theme title, a meta line ("13
  questions · 8 élèves · Raisonnement par contraposition"), keyword pills
  (`--slate-100`), and a primary "Créer une mini-leçon" CTA. Add a small **severity
  legend** near the section header. Style the "regroupement auto" badge as an info pill
  with an ⓘ explaining questions are auto-clustered by the local model.
- **Right column:** "Questions fréquentes cette semaine" ranked 1..n with a count pill
  ("15×") whose intensity scales with frequency; below it, a "Utilisation par heure"
  SVG bar chart with the peak hour highlighted in primary and annotated ("Pic 14 h").
- **Empty state:** "Aucune question cette semaine — vos élèves suivent bien".

Reuse the KPI card and pill components from the earlier pages. Then we'll do the
Content Studio.
