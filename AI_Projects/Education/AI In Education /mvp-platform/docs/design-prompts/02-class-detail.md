# Prompt — Class detail (`/teacher/class`)

> **Attach with this prompt:** the class-detail screenshot (the brief is already in
> this chat from page 1).

Now the **Class detail page**, same token system and component language as the
dashboard. Single self-contained HTML file, French copy, SVG only, no CDNs.

Implement (brief §4.2 + §8):

- **Header:** breadcrumb "Classes / 5e Scientifique A", subject tile in the subject
  accent, class name + level, and a top-right "Copilot de la classe" master toggle
  that clearly states its current effect ("En pause pour tous").
- **Stat strip:** reuse the dashboard KPI card language (Élèves · Progression moy. ·
  Quiz moy. · Temps moy. · Q. Copilot). Color any value that crosses a threshold
  (e.g. quiz avg < 50% in danger).
- **Student roster table** — the core of the page:
  - Sticky header, hairline row separators, hover highlights the row, whole row links
    to the student.
  - Columns: checkbox · Élève (avatar+name) · Progression (thin banded bar + %) ·
    Leçons · Quiz moy. · Temps · Q. Copilot · Dernière activité (relative, >7 j muted/
    amber) · Statut (status dot + word, same palette as the watchlist) · Copilot
    (per-row toggle with tooltip).
  - **Sortable headers:** active sort = indigo caret + bold label.
  - **Bulk-action toolbar** appears when ≥1 row is checked: "Pause Copilot",
    "Envoyer un rappel".
- **Filters:** search input + "Tous les statuts" dropdown + quick-filter chips
  (Inactifs · En retard · Quiz faible) matching the watchlist semantics.
- **Empty + filtered-empty states** for the table.

Extract the status pill/dot and the progress bar as reusable patterns shared with the
dashboard. Then we'll do the Copilot Insights page.
