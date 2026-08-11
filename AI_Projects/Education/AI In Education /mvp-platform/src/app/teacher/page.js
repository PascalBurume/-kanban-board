"use client";
import { useState, useEffect, useMemo } from "react";
import "./teacher-dashboard.css";
import Icon from "@/components/ui/Icon";
import TeacherShell, { useTeacherBadges } from "@/components/ui/TeacherShell";
import { OfflinePill } from "@/components/ui/chrome";
import { avatarColor, initials } from "@/lib/icons";
import BarChart from "@/components/ui/BarChart";
import { RANGES, triageClasses, formatMinutes as fmtMinutes } from "@/lib/dashboard";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// The passive context numbers. These answer "how big is my world?", which a
// teacher asks once a term — so they get a thin strip, not five hero cards.
// Everything that asks for an action today lives in the chips above them.
const STATS = [
  { key: "classes", ic: "users", label: "classes", suffix: "" },
  { key: "students", ic: "user", label: "élèves", suffix: "" },
  { key: "avgProgress", ic: "trend", label: "progression moy.", suffix: "%" },
  { key: "copilotWeek", ic: "sparkles", label: "questions Copilot (7 j)", suffix: "", href: "/teacher/insights/" },
];

// watchlist status → pill semantics (slate = inactive, amber = behind/late).
const WATCH = {
  inactive: { cls: "inactive", label: "Inactif" },
  behind: { cls: "behind", label: "En difficulté" },
};

// Known subject slugs that have both an icon and a subject-tile colour.
const SUBJECTS = ["math", "physique", "chimie", "svt", "sptic"];
function subjectSlug(field) {
  const f = (field || "").toLowerCase();
  return SUBJECTS.find((s) => f.includes(s)) || "math";
}

// Banded colours so each class card reads its health at a glance.
function bandColor(p) {
  return p >= 50 ? "var(--success-fg)" : p >= 30 ? "var(--warning-fg)" : "var(--danger-fg)";
}
function quizColor(q) {
  return q >= 70 ? "var(--success-fg)" : q >= 50 ? "var(--warning-fg)" : "var(--danger-fg)";
}

const CHART_KEYS = ["Lessons", "Time", "Quizzes"];
const CHART_SERIES = { Lessons: "lessons", Time: "minutes", Quizzes: "quizzes" };
const CHART_LABELS = { Lessons: "Leçons", Time: "Temps", Quizzes: "Quiz" };
const CHART_META = {
  Lessons: { sub: "Leçons terminées, toutes vos classes", noun: "leçons terminées" },
  Time: { sub: "Temps d’apprentissage cumulé", noun: "d’apprentissage" },
  Quizzes: { sub: "Quiz tentés, toutes vos classes", noun: "quiz tentés" },
};
const RANGE_KEYS = ["7j", "4s", "trim"];

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const DAY_FULL_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const DM_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const DM_LONG_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

// The API sends full ISO days (YYYY-MM-DD). Parsed as UTC noon so a negative
// local offset can't roll the label back a day.
function isoDate(iso) {
  const [y, m, d] = (iso || "").split("-").map(Number);
  return y && m && d ? new Date(Date.UTC(y, m - 1, d, 12)) : null;
}
// Axis label: a weekday for daily bars, a start date for weekly ones.
function bucketLabel(b, granularity) {
  const date = isoDate(b?.start);
  if (!date) return b?.start || "";
  return granularity === "week" ? DM_FMT.format(date).replace(".", "") : DAY_FMT.format(date).replace(".", "");
}
// Detail-panel heading for the selected bar.
function bucketTitle(b, granularity) {
  const start = isoDate(b?.start);
  const end = isoDate(b?.end);
  if (!start) return "";
  if (granularity === "day") return capitalize(DAY_FULL_FMT.format(start));
  return `Semaine du ${DM_LONG_FMT.format(start)}${end ? ` au ${DM_LONG_FMT.format(end)}` : ""}`;
}
export default function TeacherDashboard() {
  const [chartKey, setChartKey] = useState("Lessons");
  const [range, setRange] = useState("7j");
  const [selectedBar, setSelectedBar] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const badges = useTeacherBadges();

  // Changing the range refetches. `chartLoading` dims only the chart, so the
  // rest of the page doesn't flash back to skeletons for a control that
  // affects one panel.
  useEffect(() => {
    let alive = true;
    if (data) setChartLoading(true);
    fetch(`/api/teacher/overview/?range=${range}`)
      .then(async (r) => {
        if (r.status === 403) {
          window.location.href = "/login/";
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (!alive || !d) return;
        setData(d);
        setSelectedBar(null);
      })
      .catch(() => {})
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setChartLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    fetch("/api/teacher/feedback/").then((r) => (r.ok ? r.json() : null)).then((d) => d && setFeedback(d)).catch(() => {});
  }, []);

  const resolveFb = (id) => {
    fetch(`/api/teacher/feedback/${id}/resolve/`, { method: "POST" })
      .then((r) => { if (r.ok) setFeedback((f) => ({ ...f, items: f.items.map((it) => (it.id === id ? { ...it, resolved: true } : it)), openCount: Math.max(0, (f.openCount || 1) - 1) })); })
      .catch(() => {});
  };

  const teacher = data?.teacher || {};
  const kpis = data?.kpis || {};
  const classes = data?.classes || [];
  const watchlist = data?.watchlist || [];
  const watchTotal = data?.watchTotal ?? watchlist.length;
  const topThemes = data?.topThemes || [];
  const themeTotal = data?.themeTotal ?? topThemes.length;
  const weekly = data?.weekly || { buckets: [], granularity: "day", lessons: [], minutes: [], quizzes: [] };

  const firstName = teacher.firstName || "";

  // "Who needs me today?" — actionable synthesis from live counts.
  const priorities = [
    { key: "relancer", count: kpis.inactive7 || 0, label: "élèves à relancer", ic: "clock", tone: "amber", href: "#surveiller" },
    { key: "retours", count: (badges?.openFeedback ?? feedback?.openCount) || 0, label: "retours à traiter", ic: "message", tone: "indigo", href: "#retours" },
    { key: "corriger", count: badges?.toCorrect || 0, label: "rendus à corriger", ic: "layers", tone: "rose", href: "/teacher/projects/?status=SUBMITTED" },
  ];
  const nothingUrgent = priorities.every((p) => p.count === 0);

  // Classes: the ones asking for attention get cards, the rest get one line
  // each — so twelve classes cost a screen instead of four.
  const { cards: classCards, rows: classRows } = useMemo(() => triageClasses(classes, 4), [classes]);
  const shownCards = showAllClasses ? [...classCards, ...classRows] : classCards;
  const shownRows = showAllClasses ? [] : classRows;

  // Selected series → chart points.
  const buckets = weekly.buckets || [];
  const granularity = weekly.granularity || "day";
  const series = weekly[CHART_SERIES[chartKey]] || [];
  const values = buckets.map((_, i) => Number(series[i]) || 0);
  const chartEmpty = values.every((v) => v === 0);
  const chartMeta = CHART_META[chartKey];
  const rangeTotal = values.reduce((s, v) => s + v, 0);
  const rangeTotalLabel = chartKey === "Time" ? fmtMinutes(rangeTotal) : String(rangeTotal);

  // Detail panel: the selected bar, defaulting to the busiest so it always
  // says something. Shows that bucket across all three metrics.
  const lessonsSeries = weekly.lessons || [];
  const defaultBar = lessonsSeries.length
    ? lessonsSeries.reduce((best, v, i) => (v >= lessonsSeries[best] ? i : best), 0)
    : 0;
  const selBar = selectedBar == null ? defaultBar : selectedBar;
  const detail = {
    label: bucketTitle(buckets[selBar], granularity),
    lessons: (weekly.lessons || [])[selBar] || 0,
    minutes: (weekly.minutes || [])[selBar] || 0,
    quizzes: (weekly.quizzes || [])[selBar] || 0,
  };

  const right = (
    <>
      <OfflinePill label="Serveur local connecté" />
      <a className="btn btn-secondary" href="/teacher/insights/">
        <Icon name="download" /> Rapport hebdomadaire
      </a>
      <a className="btn btn-primary" href="/teacher/studio/">
        <Icon name="edit" /> Ouvrir le studio
      </a>
    </>
  );

  return (
    <TeacherShell active="/teacher/" crumbGroup="Enseignement" crumbPage="Tableau de bord" teacher={teacher} right={right}>
      {/* ── Band 1 · Aujourd’hui — constant height whatever the data does ── */}
      <section className="db-today">
        <div className="db-today-main">
          <div className="db-greet">
            <div className="db-date">{capitalize(DATE_FMT.format(new Date()))}</div>
            <h1>Bonjour{firstName ? `, ${firstName}` : ""} 👋</h1>
            <p className="muted">
              {nothingUrgent
                ? "Rien ne réclame votre attention ce matin."
                : "Voici ce qui vous attend."}
            </p>
          </div>
          <div className="db-actions">
            {nothingUrgent ? (
              <span className="prio-clear"><Icon name="check" /> Tout est à jour 🎉</span>
            ) : (
              priorities.filter((p) => p.count > 0).map((p) => (
                <a key={p.key} className={`prio-chip ${p.tone}`} href={p.href}>
                  <span className="pic"><Icon name={p.ic} /></span>
                  <span className="pn">{p.count}</span>
                  <span className="pl">{p.label}</span>
                  <Icon name="chevR" />
                </a>
              ))
            )}
          </div>
        </div>
        <div className="db-stats">
          {STATS.map((s) => {
            const raw = kpis[s.key];
            const val = raw == null ? (loading ? "—" : "0") : `${raw}${s.suffix}`;
            const Tag = s.href ? "a" : "div";
            return (
              <Tag className="db-stat" key={s.key} {...(s.href ? { href: s.href } : {})}>
                <Icon name={s.ic} />
                <b>{val}</b>
                <span>{s.label}</span>
              </Tag>
            );
          })}
        </div>
      </section>

      <div className="db-grid">
        {/* ── Band 2 · the week, and the classes behind it ── */}
        <div className="db-main">
          <div className="sec-h">
            <div>
              <h2>Activité</h2>
              <div className="sub">{chartMeta.sub}</div>
            </div>
            <div className="seg-tabs">
              {RANGE_KEYS.map((k) => (
                <button key={k} className={range === k ? "active" : ""} onClick={() => setRange(k)}>
                  {RANGES[k].label}
                </button>
              ))}
            </div>
          </div>
          <div className={`card panel db-chart${chartLoading ? " busy" : ""}`}>
            <div className="pill-tabs pill-tabs-right">
              {CHART_KEYS.map((key) => (
                <button key={key} className={chartKey === key ? "active" : ""} onClick={() => setChartKey(key)}>
                  {CHART_LABELS[key]}
                </button>
              ))}
            </div>
            {chartEmpty ? (
              <p className="muted db-chart-empty">
                Pas encore d’activité sur cette période — les barres se rempliront dès que vos élèves travaillent.
              </p>
            ) : (
              <>
                <div className="chart-headline">
                  <span className="ch-num">{rangeTotalLabel}</span>
                  <span className="ch-noun">{chartMeta.noun}<br />sur {RANGES[range].label.toLowerCase()}</span>
                </div>
                <BarChart
                  data={buckets.map((b, i) => ({ label: bucketLabel(b, granularity), value: values[i], highlight: i === selBar }))}
                  formatValue={chartKey === "Time" ? fmtMinutes : (v) => String(v)}
                  height={170}
                  showValues={granularity === "day"}
                  onSelect={setSelectedBar}
                  selectedIndex={selBar}
                  ariaLabel={`Activité — ${CHART_LABELS[chartKey]} : ${rangeTotalLabel} ${chartMeta.noun} sur ${RANGES[range].label.toLowerCase()}`}
                />

                <div className="day-detail">
                  <div className="dd-head">
                    <span className="dd-day"><Icon name="calendar" /> {detail.label}</span>
                    <span className="dd-hint">Cliquez sur une barre pour voir le détail</span>
                  </div>
                  <div className="dd-stats">
                    <div className="dd-stat">
                      <span className="dd-ic" style={{ background: "var(--svt-bg)", color: "var(--svt)" }}><Icon name="check" /></span>
                      <div><div className="dd-v">{detail.lessons}</div><div className="dd-l">leçons terminées</div></div>
                    </div>
                    <div className="dd-stat">
                      <span className="dd-ic" style={{ background: "var(--math-bg)", color: "var(--math)" }}><Icon name="clock" /></span>
                      <div><div className="dd-v">{fmtMinutes(detail.minutes)}</div><div className="dd-l">d’apprentissage</div></div>
                    </div>
                    <div className="dd-stat">
                      <span className="dd-ic" style={{ background: "var(--sptic-bg)", color: "var(--sptic)" }}><Icon name="target" /></span>
                      <div><div className="dd-v">{detail.quizzes}</div><div className="dd-l">quiz tentés</div></div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="sec-h">
            <div>
              <h2>Vos classes</h2>
              <div className="sub">
                {classRows.length > 0 && !showAllClasses
                  ? `Les ${classCards.length} qui demandent votre attention, puis les autres`
                  : `${classes.length} classe${classes.length > 1 ? "s" : ""}`}
              </div>
            </div>
            <a className="link" href="/teacher/class/">Tout voir <Icon name="chevR" /></a>
          </div>
          <div className="class-cards">
            {classes.length === 0 && !loading ? (
              <div className="card panel muted db-empty">Aucune classe ne vous est encore attribuée.</div>
            ) : (
              shownCards.map((c) => {
                const subj = subjectSlug(c.field);
                const alertType = c.alert?.type || "ok";
                return (
                  <a className="card card-hover tclass" href={`/teacher/class/?class=${c.id}`} key={c.id}>
                    <div className="tc-top">
                      <span className={`subject-tile subj-${subj}`}>
                        <Icon name={subj} />
                      </span>
                      <div style={{ flex: 1 }}>
                        <h3>{c.name}</h3>
                        <div className="lvl">{[c.level, c.field].filter(Boolean).join(" · ")}</div>
                      </div>
                      <span className="badge">{c.studentCount} élèves</span>
                    </div>
                    <div className="tc-stats">
                      <div className="st">
                        <span className="v" style={{ color: bandColor(c.avgProgress) }}>{c.avgProgress}%</span>
                        <span className="l">Progression</span>
                      </div>
                      <div className="st">
                        <span className="v" style={{ color: c.avgQuiz == null ? "var(--text-muted)" : quizColor(c.avgQuiz) }}>{c.avgQuiz == null ? "—" : `${c.avgQuiz}%`}</span>
                        <span className="l">Quiz moy.</span>
                      </div>
                      <div className="st">
                        <span className="v">{c.activeWeek}<small style={{ color: "var(--text-muted)", fontWeight: 600 }}>/{c.studentCount}</small></span>
                        <span className="l">Actifs 7j</span>
                      </div>
                      <div className="st">
                        <span className="v">{c.copilotCount}</span>
                        <span className="l">Q. Copilot</span>
                      </div>
                    </div>
                    <div className="tc-health">
                      <div className="tc-healthbar">
                        {c.onTrack > 0 && <span className="seg ok" style={{ flex: c.onTrack }} title={`${c.onTrack} sur la bonne voie`} />}
                        {c.behind > 0 && <span className="seg behind" style={{ flex: c.behind }} title={`${c.behind} en difficulté`} />}
                        {c.inactive > 0 && <span className="seg inactive" style={{ flex: c.inactive }} title={`${c.inactive} inactifs`} />}
                      </div>
                      <div className="tc-legend">
                        <span className="lg ok"><i /> {c.onTrack} sur la bonne voie</span>
                        {c.behind > 0 && <span className="lg behind"><i /> {c.behind} en difficulté</span>}
                        {c.inactive > 0 && <span className="lg inactive"><i /> {c.inactive} inactif{c.inactive > 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                    <div className="tc-foot">
                      <div className="progress-wrap">
                        <div className="pbar"><span style={{ width: `${c.avgProgress}%`, background: bandColor(c.avgProgress) }} /></div>
                        <span className={`tc-pill ${alertType}`}>{c.alert?.text}</span>
                      </div>
                    </div>
                  </a>
                );
              })
            )}
          </div>

          {shownRows.length > 0 && (
            <div className="card panel db-rest">
              {shownRows.map((c) => (
                <a className="crow" href={`/teacher/class/?class=${c.id}`} key={c.id}>
                  <span className={`subject-tile subj-${subjectSlug(c.field)} sm`}><Icon name={subjectSlug(c.field)} /></span>
                  <span className="cr-name">
                    {c.name}
                    <small>{c.studentCount} élèves</small>
                  </span>
                  <span className="cr-bar"><i style={{ width: `${c.avgProgress}%`, background: bandColor(c.avgProgress) }} /></span>
                  <span className="cr-v" style={{ color: bandColor(c.avgProgress) }}>{c.avgProgress}%</span>
                  <span className={`tc-pill ${c.alert?.type || "ok"}`}>{c.alert?.text}</span>
                  <Icon name="chevR" />
                </a>
              ))}
            </div>
          )}
          {classRows.length > 0 && (
            <button className="db-more" onClick={() => setShowAllClasses((v) => !v)}>
              <Icon name={showAllClasses ? "chevD" : "chevR"} />
              {showAllClasses ? "Réduire" : `Voir les ${classRows.length} autres en détail`}
            </button>
          )}
        </div>

        {/* ── Band 3 · the rail — three lists, each capped and honest about it ── */}
        <aside className="db-rail">
          <div className="card panel" id="surveiller">
            <div className="panel-head">
              <div className="ph-title">
                <h3><Icon name="alert" /> À surveiller</h3>
                <div className="ph-sub">Élèves inactifs ou en difficulté</div>
              </div>
              {watchTotal > 0 && <span className="badge badge-danger">{watchTotal}</span>}
            </div>
            <div>
              {watchlist.length === 0 ? (
                <p className="muted db-none">Toutes vos classes sont sur la bonne voie 🎉</p>
              ) : (
                watchlist.map((w) => {
                  const name = `${w.firstName || ""} ${w.lastName || ""}`.trim();
                  const meta = WATCH[w.status] || WATCH.behind;
                  return (
                    <a className="watch-row" key={w.id} href={`/teacher/class/?class=${w.classId || ""}&filter=${w.status === "inactive" ? "inactive" : "behind"}`}>
                      <span className="avatar avatar-sm" style={{ background: w.avatarColor || avatarColor(name) }}>
                        {initials(name)}
                      </span>
                      <div className="info">
                        <div className="n">{name}</div>
                        <div className="d">{[w.className, w.reason].filter(Boolean).join(" · ")}</div>
                      </div>
                      <span className={`status-tag ${meta.cls}`}>
                        <span className={`sdot ${meta.cls}`} />
                        {meta.label}
                      </span>
                    </a>
                  );
                })
              )}
            </div>
            {watchTotal > watchlist.length && (
              <a className="card-foot-link" href="/teacher/class/">
                Voir les {watchTotal - watchlist.length} autres <Icon name="chevR" />
              </a>
            )}
          </div>

          <div className="card panel" id="retours">
            <div className="panel-head">
              <div className="ph-title">
                <h3><Icon name="message" /> Retours des élèves</h3>
                <div className="ph-sub">Difficultés signalées sur une leçon</div>
              </div>
              {feedback?.openCount > 0 && <span className="badge badge-warning">{feedback.openCount}</span>}
            </div>
            <div>
              {!feedback || feedback.items.length === 0 ? (
                <p className="muted db-none">Aucun retour pour le moment.</p>
              ) : (
                feedback.items.slice(0, 5).map((f) => (
                  <div className={`fb-row${f.resolved ? " done" : ""}`} key={f.id}>
                    <span className="avatar avatar-sm" style={{ background: f.avatarColor || avatarColor(f.studentName) }}>{initials(f.studentName)}</span>
                    <div className="info">
                      <div className="n">{f.studentName} <span className={`fb-pct u${f.understanding}`}>{f.understanding}%</span></div>
                      <div className="d">{f.lessonTitle}</div>
                      {f.message && <div className="fb-msg">« {f.message} »</div>}
                    </div>
                    {!f.resolved ? (
                      <button className="fb-resolve" onClick={() => resolveFb(f.id)} title="Marquer comme traité"><Icon name="check" /></button>
                    ) : (
                      <span className="fb-done-tag"><Icon name="check" /></span>
                    )}
                  </div>
                ))
              )}
            </div>
            {feedback?.items?.length > 0 && (
              <a className="card-foot-link" href="/teacher/feedback/">Traiter tous les retours <Icon name="chevR" /></a>
            )}
          </div>

          <div className="card panel">
            <div className="panel-head">
              <div className="ph-title">
                <h3><Icon name="sparkles" /> Thèmes Copilot</h3>
                <div className="ph-sub">Notions les plus demandées · {RANGES[range].label.toLowerCase()}</div>
              </div>
              <a className="link" href="/teacher/insights/">Tout <Icon name="chevR" /></a>
            </div>
            <div>
              {topThemes.length === 0 ? (
                <p className="muted db-none">Aucune question Copilot sur cette période.</p>
              ) : (
                topThemes.map((t, i) => (
                  <div className="theme-row" key={`${t.label}-${i}`}>
                    <span className="theme-rank">{i + 1}</span>
                    <span className="tt">
                      {t.label}
                      <small>{t.subject}</small>
                    </span>
                    <span className="cnt">{t.count}×</span>
                  </div>
                ))
              )}
            </div>
            {themeTotal > topThemes.length && (
              <a className="card-foot-link" href="/teacher/insights/">
                {themeTotal} leçons ont fait l’objet de questions <Icon name="chevR" />
              </a>
            )}
          </div>
        </aside>
      </div>
    </TeacherShell>
  );
}
