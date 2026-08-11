# Prompt — Teacher Dashboard (`/teacher`)

> **Attach with this prompt:** `teacher-interface-design.md` + the dashboard screenshot.

I'm redesigning the **teacher Dashboard** of an offline-first school platform
(Mwalimu). The attached `teacher-interface-design.md` is the full design brief; the
screenshot is the current state.

Build a **high-fidelity, interactive HTML/CSS mockup** of the dashboard as a single
self-contained file (no external CDNs, SVG charts only). Define the §2 tokens as CSS
variables — indigo `#4f46e5` primary, the semantic status colors, Lexend for
headings/numbers, Inter for body. French copy.

Implement these as acceptance criteria (brief §4.1 + §8):

- **Left sidebar:** Enseignement (Tableau de bord · Mes classes · Analyses Copilot
  with a count badge · Studio de contenu) + Compte (Paramètres) + teacher footer.
  Active item = indigo-50 fill, indigo-700 text, 3px left accent bar.
- **Top bar:** greeting "Bonjour, Grâce" + subtitle, offline pill, "Rapport
  hebdomadaire" (secondary) and "Ouvrir le studio" (primary indigo).
- **5 KPI cards** (Classes · Élèves · Progression moy. · Inactifs 7+ j · Questions
  Copilot): tinted icon, muted label, big Lexend number, and a real
  week-over-week delta (▲/▼ + value) in success/danger. "Inactifs 7+ j" and
  "Questions Copilot" are clickable (deep-link affordance).
- **"Vos classes" cards** (3): subject tile in the subject accent color, name, level,
  a stat strip, a status banner (amber "3 élèves inactifs 7+ j" / green "tout va
  bien"), and a progress bar whose color bands green→amber→rose. Whole card links to
  the class. "Tout voir →".
- **"À surveiller" watchlist:** avatar, name, reason line, status pill
  (slate=inactif, amber=en retard, rose=à risque), plus a one-tap "Envoyer un rappel".
  Count in header.
- **"Retours des élèves":** rows with understanding-% badge, message snippet, resolve
  check; resolved rows dim.
- **Weekly activity chart:** SVG bars with a Leçons/Temps/Quiz segmented control, peak
  bar highlighted in primary.
- **Empty states** for the watchlist and feedback lists.

Layout: main column + right rail on desktop; right rail drops below on tablet; single
column under 768px. Then we'll do the Class detail page.
