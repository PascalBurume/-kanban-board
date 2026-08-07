# Prompt — Content Studio (`/teacher/studio`)

> **Attach with this prompt:** the studio screenshot (brief already in this chat).

Finally the **Content Studio** — a 3-pane lesson editor. Same token system and
components. Single self-contained HTML file, French copy, no CDNs. (You may mock the
Markdown→preview rendering statically.)

Implement (brief §4.4):

- **3-pane layout**, side panes collapsible:
  - **Left — course tree (~260px):** "Arborescence du cours", modules as section
    labels with a lesson count, lessons with status chips (EN LIGNE = success tint,
    Brouillon = warning tint), "+ Ajouter une leçon". Selected lesson = indigo-50 fill
    + left accent bar.
  - **Center — editor (workspace):** a toolbar with the lesson status as a real
    segmented control (Brouillon `--warning` / Publié `--success`), "Vue élève", and a
    primary "Enregistrer" button that shows dirty/saved state ("Enregistré ✓" when
    clean) with an autosave indicator. A Contenu / Quiz segmented tab strip (reuse the
    `pill-tabs` style; Quiz shows a question-count badge). A formatting toolbar with
    hover/active states + tooltips. A Markdown text area.
  - **Right — live preview:** labeled "Aperçu en direct", rendered with the
    `.prose-reader` typography so it matches the student view; KaTeX inline; a
    device-width toggle (mobile/desktop).
- **Responsive:** under 1024px collapse to a single pane with a segmented switch
  (Plan · Éditeur · Aperçu) instead of three cramped columns.
- **Empty state** for a brand-new lesson ("Commencez à écrire, l'aperçu apparaît ici").

That completes the four teacher pages — all sharing one token system and component set.
