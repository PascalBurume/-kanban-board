# Teacher Interface — Design Brief

A design specification for the **teacher-facing area** of Mwalimu, covering all four
pages. Hand this to Claude Code as the brief when asking it to improve the views.

**Scope (routes & files):**

| Page | Route | Page file | Stylesheet |
|------|-------|-----------|------------|
| Dashboard | `/teacher` | `src/app/teacher/page.js` | `src/app/teacher/teacher-dashboard.css` |
| Class detail | `/teacher/class` | `src/app/teacher/class/page.js` | `src/app/teacher/class/class-detail.css` |
| Copilot Insights | `/teacher/insights` | `src/app/teacher/insights/page.js` | `src/app/teacher/insights/insights.css` |
| Content Studio | `/teacher/studio` | `src/app/teacher/studio/page.js` | `src/app/teacher/studio/studio.css` |
| Shared shell | — | `src/components/ui/chrome.js` | `src/styles/mwalimu.css` |

**Login (for previewing):** staff login → `g.mukendi@mwalimu.school` / `teach1234`.

---

## 0. How to use this brief

- **Reuse the existing token system. Do not introduce new colors, radii, shadows, or
  fonts.** Everything you need is already defined in `src/styles/mwalimu.css` (see §2).
  Hard-coded hex values in the current CSS should be migrated to `var(--token)`.
- **One page at a time.** Each page section below has a *Current state* and a
  *Target* list. Treat the Target list as the acceptance criteria.
- **Keep it offline-first and low-bandwidth.** No web fonts beyond the self-hosted
  Lexend/Inter, no external image CDNs, no heavy client libs. Charts stay SVG
  (`src/components/ui/BarChart.js`).
- The UI language is **French**. Keep all copy in French and match the existing tone
  (warm, direct, teacher-to-teacher).

---

## 1. Design principles (north star)

1. **Calm, data-dense, scannable.** A teacher opens this to answer *"who needs me
   today?"* in under 5 seconds. Lead with the answer, not the chrome.
2. **One primary action per screen.** Everything else is secondary/tertiary.
3. **Status is color-coded and consistent** across every page: green = on track,
   amber = watch, rose = at risk/late, slate = neutral/inactive.
4. **Cards are containers, not decoration.** Consistent padding, radius, border, and
   shadow. No card-in-card nesting deeper than one level.
5. **Generous whitespace over borders.** Prefer spacing and a single hairline border
   to heavy dividers.
6. **Responsive down to tablet (768px).** Teachers use cheap tablets on a LAN.

---

## 2. Design tokens (already defined — use these names)

From `src/styles/mwalimu.css :root`. Light theme is canonical; a dark theme exists.

**Brand / primary**
```
--primary: #4f46e5 (indigo-600)   --primary-hover: #4338ca (indigo-700)
--indigo-50 … --indigo-900        --ring: 0 0 0 4px var(--indigo-100)
```

**Semantic status**
```
--success #10b981  --success-bg #d1fae5  --success-fg #047857
--warning #f59e0b  --warning-bg #fef3c7  --warning-fg #b45309
--danger  #f43f5e  --danger-bg  #ffe4e6  --danger-fg  #be123c
--info    #3b82f6
```

**Neutrals / surfaces / text**
```
--bg #f6f7fb   --surface #fff   --surface-2 slate-50
--border slate-200   --border-strong slate-300
--text slate-900   --text-soft slate-600   --text-muted slate-400
```

**Subject accents** (use for subject tiles & class identity)
```
--math #2563eb / --math-bg #dbeafe        --svt #16a34a / --svt-bg #dcfce7
--sptic #7c3aed / --sptic-bg #ede9fe      --chimie #0d9488 / --chimie-bg #ccfbf1
--physique #ea580c / --physique-bg #ffedd5
```

**Radii** `--r-sm 8 · --r-md 12 · --r-lg 16 · --r-xl 22 · --r-pill 999`
**Shadows** `--sh-xs · --sh-sm · --sh-md · --sh-lg · --sh-xl`
**Type** `--font-head Lexend` (headings/numbers) · `--font-ui Inter` (body/UI)

**Spacing scale to standardize on:** 4 · 8 · 12 · 16 · 22 · 32 px.

---

## 3. Global shell (`chrome.js`)

Consistent on every teacher page. Currently solid; refinements only.

**Left sidebar (≈240px):**
- Brand mark + "Mwalimu" wordmark (top).
- Section label `ENSEIGNEMENT` → Tableau de bord · Mes classes · Analyses Copilot
  (badge for unread count) · Studio de contenu.
- Section label `COMPTE` → Paramètres.
- Footer: teacher avatar + name + role, sign-out icon.

**Top bar:**
- Breadcrumb / page title (left).
- `OfflinePill` (server status) · `LangToggle` FR/EN · notifications bell (right).

**Target refinements:**
- Active nav item: filled indigo-50 background, indigo-700 text, 3px left accent bar.
  Make sure the active state is unmistakable (the current one is subtle).
- Sidebar nav badge (e.g. the "14" on Analyses) → pill using `--indigo-600` bg /
  white text, not raw red.
- Collapse the sidebar to icons-only under 1024px; hide entirely under 768px behind a
  hamburger.
- The notification bell needs a visible unread dot when count > 0.

---

## 4. Page specs

### 4.1 Dashboard — `/teacher`

**Current state:** Greeting ("Bonjour, Grâce 👋") + subtitle. A row of 5 KPI stat
cards (Classes · Élèves · Progression moy. · Inactifs 7+ j · Questions Copilot). Below,
a 2-column grid: left = "Vos classes" cards, right rail = "À surveiller" watchlist +
"Retours des élèves". A weekly activity chart with Leçons/Temps/Quiz tabs at the bottom.

**Target:**
- **KPI cards:** equal width, `--r-lg`, `--sh-xs`, hairline border. Each = small icon
  (top-left, tinted circle), label (`--text-muted`, 11px, uppercase tracking), big
  number (`--font-head`, ~28px), and a subtle delta vs last week (▲/▼ + %) in
  success/danger. Right now they show "Toutes les classes" filler — replace with the
  trend delta. The "Inactifs 7+ j" and "Questions Copilot" cards should be clickable
  (deep-link to the watchlist / insights).
- **"Vos classes" cards:** each shows subject tile (subject-accent color), class name,
  level, a 4-stat strip (progression / statut / élèves / [quiz]), a status alert
  banner (amber "3 élèves inactifs 7+ j" / green "tout va bien"), and a progress bar
  footer. Make the whole card a link to that class. Cap at 3–4, with "Tout voir →".
- **À surveiller (watchlist):** list rows with avatar, name, reason line, and a status
  pill ("Inactif", "En retard", "Quiz faible"). The pill color must match semantics
  (inactive = slate, late = amber, at-risk = rose). Add a one-tap action per row
  (e.g. "Envoyer un rappel"). Show count in the header ("6 élèves").
- **Retours des élèves:** feedback rows with avatar, understanding-% badge, message
  snippet, and a resolve check button. Resolved rows dim to 55% opacity.
- **Weekly activity chart:** keep the SVG `BarChart` with Leçons/Temps/Quiz segmented
  control. Ensure axis labels use `--text-soft`, bars use `--primary` with the peak
  bar highlighted.
- **Primary action:** "Ouvrir le studio" (filled indigo). "Rapport hebdomadaire"
  stays secondary (outline).
- **Empty/zero states:** every list needs a friendly empty state (icon + one line),
  e.g. watchlist with nobody at risk → "Toutes vos classes sont sur la bonne voie 🎉".

### 4.2 Class detail — `/teacher/class`

**Current state:** Breadcrumb "Classes / 5e Scientifique A". Header with subject tile,
class name, level, and a "Copilot de la classe" toggle (En pause pour tous). A 5-stat
strip (Élèves · Progression moy. · Quiz moy. · Temps moy. · Q. Copilot). An "Accès aux
modules" banner. A search + status filter, then a student table (Élève · Progression ·
Leçons · Quiz moy. · Temps · Q. Copilot · Dernière activité · Statut · Copilot toggle).

**Target:**
- **Header:** subject tile uses the subject accent. The "Copilot de la classe" master
  toggle stays top-right, clearly labeled with its current effect.
- **Stat strip:** same KPI card language as the dashboard (consistency). Color the
  values that cross a threshold (e.g. quiz avg < 50% in `--danger-fg`).
- **Student table — the core of this page:**
  - Sticky header row; zebra-free, hairline row separators only.
  - **Progression** column: thin progress bar + % (bar color shifts green→amber→rose
    by band).
  - **Statut** column: a single status dot + word, consistent palette. Make the dot
    + label a reusable component (also used on the dashboard watchlist).
  - **Dernière activité**: relative time ("il y a 4 j"), with rows >7 days muted/amber.
  - **Copilot** per-row toggle: small, right-aligned, with a tooltip explaining it
    pauses the AI tutor for that student.
  - Row hover: subtle `--surface-2` background; whole row links to the student detail.
  - Add **bulk actions**: the checkbox column should enable "Pause Copilot",
    "Envoyer un rappel" for the selected set (toolbar appears when ≥1 selected).
  - Sortable column headers (the carets are already drawn — wire them up visually:
    active sort = indigo caret + bold label).
- **Filters:** search input + "Tous les statuts" dropdown; add quick-filter chips
  (Inactifs · En retard · Quiz faible) that mirror the watchlist semantics.
- **Empty/filtered-empty states** for the table.

### 4.3 Copilot Insights — `/teacher/insights`

**Current state:** Title + subtitle, class & period selectors (top-right). 4 KPI cards
(Questions posées · Élèves actifs · Thèmes d'incompréhension · Heure la plus active).
Left: "Thèmes d'incompréhension" with an "regroupement auto" badge — cards per theme
with tags, source, and a "Créer une mini-leçon" CTA. Right: "Questions fréquentes cette
semaine" ranked list + a "Utilisation par heure" bar chart.

**Target:**
- **Theme cards** are the hero. Each: a severity icon (rose/amber/green by how many
  students struggle), the question/theme title, a meta line ("13 questions · 8 élèves ·
  Raisonnement par contraposition"), keyword tags (pill, `--slate-100`), and the
  primary CTA "Créer une mini-leçon" (filled indigo). The left color bar of each card
  should encode severity (rose = many students, amber = some, green = resolved/minor).
- **Severity legend** somewhere near the section header so the color bars are legible.
- **"regroupement auto" badge:** style as an info pill (`--info` tint) with an "ⓘ"
  that explains questions are auto-clustered by the local model.
- **Frequent questions list:** ranked 1..n with a count pill on the right (e.g. "15×").
  Count pill intensity scales with frequency.
- **Usage-by-hour chart:** SVG bars, peak hour highlighted in `--primary`, annotated
  ("Pic 14 h"). Keep y-axis light.
- **Selectors** (class / period) → consistent dropdown component with `--r-pill` or
  `--r-md`, `--border`, chevron icon.
- **Empty state:** "Aucune question cette semaine — vos élèves suivent bien 👍".

### 4.4 Content Studio — `/teacher/studio`

**Current state:** A 3-pane editor. Left: course tree ("Arborescence du cours") with
modules → lessons, each lesson tagged "EN LIGNE", "+ Ajouter une leçon". Center: lesson
toolbar (status: Brouillon/Publié, "Vue élève", "Enregistrer"), formatting toolbar, tab
strip (Contenu de la leçon · Quiz), and a Markdown editor. Right: "Aperçu en direct ·
LaTeX" rendered preview.

**Target:**
- **3-pane layout** with clear column roles and resizable/collapsible side panes:
  - Left tree ≈260px — collapsible. Selected lesson highlighted (indigo-50 + left
    accent). Module headers as section labels with a count. Status chips
    (EN LIGNE = success tint; Brouillon = warning tint) consistent with the rest of
    the app.
  - Center editor — the workspace. Status pill (Brouillon `--warning`, Publié
    `--success`) is a real toggle/segmented control. Toolbar buttons get hover/active
    states and tooltips. The "Enregistrer" primary button shows dirty/saved state
    ("Enregistré ✓" when clean).
  - Right preview — labeled "Aperçu en direct", uses the `.prose-reader` typography
    (already defined in `globals.css`) so the preview matches what students see. KaTeX
    renders inline. Add a device-width toggle (mobile/desktop preview).
- **Tabs (Contenu / Quiz):** segmented `pill-tabs` style already in dashboard CSS —
  reuse it. Quiz tab shows a question count badge.
- **Autosave + unsaved-changes guard.** Surface autosave status near "Enregistrer".
- **Responsive:** under 1024px collapse to a single pane with a segmented switch
  (Plan · Éditeur · Aperçu) rather than three cramped columns.
- **Empty state** for a brand-new lesson ("Commencez à écrire, l'aperçu apparaît ici").

---

## 5. Shared component patterns (build/reuse, don't re-style per page)

Extract these into `src/components/ui` so all four pages share them:

1. **`<StatCard>`** — icon, label, value, optional delta. Used on dashboard, class,
   insights KPI rows.
2. **`<StatusPill>` / `<StatusDot>`** — `on-track | watch | at-risk | inactive | late`
   → maps to success/amber/rose/slate. One source of truth for status colors.
3. **`<ProgressBar>`** — thin bar, banded color (green/amber/rose), optional % label.
4. **`<DataTable>`** — sticky header, hairline rows, hover, sortable headers, optional
   checkbox column + bulk-action toolbar. Powers the class roster.
5. **`<SegmentedControl>` / `pill-tabs`** — already partially in CSS; consolidate.
6. **`<Dropdown>`** — class/period selectors, status filter.
7. **`<EmptyState>`** — icon + headline + optional CTA.
8. **`<Card>`** — `--surface`, `--border`, `--r-lg`, `--sh-xs`; hover lifts to
   `--sh-md`. (The `.ex-card` in `globals.css` is the reference look.)

---

## 6. Responsive behavior

| Breakpoint | Behavior |
|------------|----------|
| ≥1280px | Full layout, sidebar expanded, multi-column grids. |
| 1024–1279 | Sidebar collapses to icons; dashboard right rail drops below main. |
| 768–1023 | Studio collapses to single pane (segmented switch); tables scroll-x; KPI cards wrap 2-up. |
| <768 | Sidebar → hamburger drawer; everything single-column; tables become stacked cards. |

The existing CSS already has `@media (max-width: 1100px)` and `760px` breakpoints —
align new work to these and add the tablet single-pane studio rule.

---

## 7. Accessibility (non-negotiable)

- Status is **never color-only** — always pair color with text/icon (the watchlist
  pills already do this; keep it).
- All interactive controls keyboard-focusable with a visible focus ring (`--ring`).
- Color contrast ≥ 4.5:1 for text. `--text-muted` on white passes for ≥12px labels;
  don't use it for body copy.
- Table headers use `<th scope="col">`; toggles have `aria-label` and `aria-pressed`.
- Charts have an accessible summary (caption or `aria-label` with the headline number).
- Min tap target 40×40px (tablet use).

---

## 8. Concrete improvement checklist (observed in the live app)

Quick wins to call out when handing this to Claude Code:

- [ ] KPI cards on the dashboard show "Toutes les classes" filler — replace with a
      real week-over-week delta.
- [ ] Active sidebar nav state is too subtle — add fill + left accent bar.
- [ ] Status colors aren't perfectly consistent across dashboard vs class table —
      unify via a single `<StatusPill>`.
- [ ] Class roster sort carets are drawn but appear non-functional — wire up + show
      active sort state.
- [ ] No bulk actions on the class roster despite the checkbox column existing.
- [ ] Studio "Enregistrer" gives no saved/dirty feedback; add autosave status.
- [ ] Migrate hard-coded hex values in the four page stylesheets to `var(--token)`.
- [ ] Add empty states to every list/table (watchlist, feedback, roster, insights,
      new lesson).
- [ ] Make KPI cards and class cards genuinely clickable (cursor + hover + link).
- [ ] Studio is unusable under ~1024px — add the single-pane segmented fallback.
