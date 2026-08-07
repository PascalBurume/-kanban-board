"use client";
import { useState, useEffect } from "react";
import "./teacher-dashboard.css";
import Icon from "@/components/ui/Icon";
import TeacherShell, { useTeacherBadges } from "@/components/ui/TeacherShell";
import { OfflinePill } from "@/components/ui/chrome";
import { avatarColor, initials } from "@/lib/icons";
import BarChart from "@/components/ui/BarChart";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Static KPI presentation (icons/colours/labels). Numbers come from the API.
// `sub` is an honest descriptor (the API exposes no week-over-week delta, so we
// don't fabricate one). `href` makes the at-risk / copilot cards deep-link.
const KPI_DEFS = [
  { key: "classes", ic: "users", c: "var(--indigo-600)", bg: "var(--indigo-100)", label: "Classes", suffix: "", sub: () => "Vos classes actives" },
  { key: "students", ic: "user", c: "var(--math)", bg: "var(--math-bg)", label: "Élèves", suffix: "", sub: () => "Élèves inscrits" },
  { key: "avgProgress", ic: "trend", c: "var(--success)", bg: "var(--success-bg)", label: "Progression moy.", suffix: "%", sub: () => "Moyenne de vos classes" },
  { key: "inactive7", ic: "clock", c: "var(--warning)", bg: "var(--warning-bg)", label: "Inactifs 7+ j", suffix: "", href: "#surveiller", sub: (v) => (v > 0 ? "À relancer →" : "Tout le monde est actif") },
  { key: "copilotWeek", ic: "sparkles", c: "var(--sptic)", bg: "var(--sptic-bg)", label: "Questions Copilot", suffix: "", href: "/teacher/insights/", sub: () => "7 derniers jours · voir →" },
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
// What each weekly metric measures + how to phrase its 7-day total.
const CHART_META = {
  Lessons: { sub: "Leçons terminées chaque jour, toutes vos classes", noun: "leçons terminées" },
  Time: { sub: "Temps d’apprentissage cumulé chaque jour", noun: "d’apprentissage" },
  Quizzes: { sub: "Quiz tentés chaque jour, toutes vos classes", noun: "quiz tentés" },
};
const DAY_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const DAY_FULL_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
function dateFromMmdd(mmdd) {
  const [m, d] = (mmdd || "").split("-").map(Number);
  if (!m || !d) return null;
  return new Date(new Date().getFullYear(), m - 1, d);
}
// "MM-DD" → short weekday ("lun", "mar"…) for readable, this-week axis labels.
function fmtChartDay(mmdd) {
  const date = dateFromMmdd(mmdd);
  return date ? DAY_FMT.format(date).replace(".", "") : mmdd;
}
// "MM-DD" → "Mercredi 17 juin" for the day-detail panel.
function fmtDayFull(mmdd) {
  const date = dateFromMmdd(mmdd);
  return date ? capitalize(DAY_FULL_FMT.format(date)) : mmdd;
}
function fmtMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m}` : ""}` : `${m} min`;
}

export default function TeacherDashboard() {
  const [chartKey, setChartKey] = useState("Lessons");
  const [selectedDay, setSelectedDay] = useState(null); // bar clicked in the chart
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const badges = useTeacherBadges();

  useEffect(() => {
    fetch("/api/teacher/overview/")
      .then(async (r) => {
        if (r.status === 403) {
          window.location.href = "/login/";
          return null;
        }
        return r.json();
      })
      .then((d) => d && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
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
  const topThemes = data?.topThemes || [];
  const weekly = data?.weekly || { days: [], lessons: [], minutes: [], quizzes: [] };

  const firstName = teacher.firstName || "";

  // "Who needs me today?" — actionable synthesis from live counts.
  const priorities = [
    { key: "relancer", count: kpis.inactive7 || 0, label: "élèves à relancer", ic: "clock", tone: "amber", href: "#surveiller" },
    { key: "retours", count: (badges?.openFeedback ?? feedback?.openCount) || 0, label: "retours à traiter", ic: "message", tone: "indigo", href: "#retours" },
    { key: "corriger", count: badges?.toCorrect || 0, label: "rendus à corriger", ic: "layers", tone: "rose", href: "/teacher/projects/?status=SUBMITTED" },
  ];

  // Selected weekly series → chart points; bar heights scale to series max.
  const seriesKey = CHART_SERIES[chartKey];
  const series = weekly[seriesKey] || [];
  const chartData = (weekly.days || []).map((d, i) => ({ d, v: Number(series[i]) || 0 }));
  const max = chartData.length ? Math.max(...chartData.map((p) => p.v), 1) : 1;
  const chartEmpty = chartData.every((p) => p.v === 0);
  const chartMeta = CHART_META[chartKey];
  const weekTotal = chartData.reduce((s, p) => s + p.v, 0);
  const weekTotalLabel = chartKey === "Time" ? fmtMinutes(weekTotal) : String(weekTotal);

  // Day-detail: the selected bar (defaults to the busiest day so it shows
  // something meaningful). Shows that day across ALL three metrics.
  const lessonsSeries = weekly.lessons || [];
  const defaultDay = lessonsSeries.length
    ? lessonsSeries.reduce((best, v, i) => (v >= lessonsSeries[best] ? i : best), 0)
    : 0;
  const selDay = selectedDay == null ? defaultDay : selectedDay;
  const dayStats = {
    label: fmtDayFull((weekly.days || [])[selDay]),
    lessons: (weekly.lessons || [])[selDay] || 0,
    minutes: (weekly.minutes || [])[selDay] || 0,
    quizzes: (weekly.quizzes || [])[selDay] || 0,
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
      <div className="dash-hero">
        <div className="dash-greet">
          <div className="dash-date">{capitalize(DATE_FMT.format(new Date()))}</div>
          <h1>Bonjour{firstName ? `, ${firstName}` : ""} 👋</h1>
          <p className="muted">Voici l’évolution de vos {kpis.classes ?? classes.length} classes cette semaine.</p>
        </div>
      </div>

      {/* Priorités du jour — the "who needs me today?" synthesis */}
      <div className="dash-prio">
        <span className="dash-prio-label"><Icon name="sparkles" /> À faire aujourd’hui</span>
        {priorities.every((p) => p.count === 0) ? (
          <span className="prio-clear"><Icon name="check" /> Tout est à jour — rien d’urgent 🎉</span>
        ) : (
          <div className="prio-chips">
            {priorities.filter((p) => p.count > 0).map((p) => (
              <a key={p.key} className={`prio-chip ${p.tone}`} href={p.href}>
                <span className="pic"><Icon name={p.ic} /></span>
                <span className="pn">{p.count}</span>
                <span className="pl">{p.label}</span>
                <Icon name="chevR" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        {KPI_DEFS.map((k) => {
          const raw = kpis[k.key];
          const val = raw == null ? (loading ? "—" : "0") : `${raw}${k.suffix}`;
          const Tag = k.href ? "a" : "div";
          const danger = k.key === "inactive7" && raw > 0;
          return (
            <Tag className={`card kpi${k.href ? " card-hover" : ""}`} key={k.key} {...(k.href ? { href: k.href } : {})} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="kt">
                <span className="kic" style={{ background: k.bg, color: k.c }}>
                  <Icon name={k.ic} />
                </span>
                <span className="klabel">{k.label}</span>
              </div>
              <div className="kval">{val}</div>
              <span className="kdelta" style={{ color: danger ? "var(--danger-fg)" : k.href ? "var(--primary)" : "var(--text-muted)" }}>
                {k.sub(Number(raw) || 0)}
              </span>
            </Tag>
          );
        })}
      </div>

      {/* Vos classes — full-width row */}
      <div className="sec-h">
        <h2>Vos classes</h2>
        <a className="link" href="/teacher/class/" style={{ fontSize: "13px", fontWeight: 600, color: "var(--primary)" }}>
          Tout voir →
        </a>
      </div>
      <div className="class-cards">
            {classes.length === 0 && !loading ? (
              <div className="card panel muted" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "28px" }}>
                Aucune classe ne vous est encore attribuée.
              </div>
            ) : (
              classes.map((c) => {
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

      <div className="dash-grid">
        {/* left column — activity + at-risk students */}
        <div>
          <div className="sec-h">
            <div>
              <h2>Activité hebdomadaire</h2>
              <div className="sub">{chartMeta.sub}</div>
            </div>
            <div className="pill-tabs">
              {CHART_KEYS.map((key) => (
                <button key={key} className={chartKey === key ? "active" : ""} onClick={() => setChartKey(key)}>
                  {CHART_LABELS[key]}
                </button>
              ))}
            </div>
          </div>
          <div className="card panel">
            {chartEmpty ? (
              <p className="muted" style={{ textAlign: "center", padding: "40px 0", fontSize: 14 }}>
                Pas encore d’activité cette semaine — les barres se rempliront dès que vos élèves travaillent.
              </p>
            ) : (
              <>
                <div className="chart-headline">
                  <span className="ch-num">{weekTotalLabel}</span>
                  <span className="ch-noun">{chartMeta.noun}<br />cette semaine</span>
                </div>
                <BarChart
                  data={chartData.map((d, i) => ({ label: fmtChartDay(d.d), value: d.v, highlight: i === selDay }))}
                  formatValue={chartKey === "Time" ? fmtMinutes : (v) => String(v)}
                  height={170}
                  onSelect={setSelectedDay}
                  selectedIndex={selDay}
                  ariaLabel={`Activité hebdomadaire — ${CHART_LABELS[chartKey]} : ${weekTotalLabel} ${chartMeta.noun} cette semaine`}
                />

                {/* Day detail — clicking a bar shows that day across all metrics */}
                <div className="day-detail">
                  <div className="dd-head">
                    <span className="dd-day"><Icon name="calendar" /> {dayStats.label}</span>
                    <span className="dd-hint">Cliquez sur un jour pour voir le détail</span>
                  </div>
                  <div className="dd-stats">
                    <div className="dd-stat">
                      <span className="dd-ic" style={{ background: "var(--svt-bg)", color: "var(--svt)" }}><Icon name="check" /></span>
                      <div><div className="dd-v">{dayStats.lessons}</div><div className="dd-l">leçons terminées</div></div>
                    </div>
                    <div className="dd-stat">
                      <span className="dd-ic" style={{ background: "var(--math-bg)", color: "var(--math)" }}><Icon name="clock" /></span>
                      <div><div className="dd-v">{fmtMinutes(dayStats.minutes)}</div><div className="dd-l">d’apprentissage</div></div>
                    </div>
                    <div className="dd-stat">
                      <span className="dd-ic" style={{ background: "var(--sptic-bg)", color: "var(--sptic)" }}><Icon name="target" /></span>
                      <div><div className="dd-v">{dayStats.quizzes}</div><div className="dd-l">quiz tentés</div></div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="card panel" id="surveiller" style={{ marginTop: "18px", scrollMarginTop: "90px" }}>
            <div className="panel-head">
              <div className="ph-title">
                <h3><Icon name="alert" /> À surveiller</h3>
                <div className="ph-sub">Élèves inactifs ou en difficulté à relancer</div>
              </div>
              {watchlist.length > 0 && <span className="badge badge-danger">{watchlist.length} élèves</span>}
            </div>
            <div>
              {watchlist.length === 0 ? (
                <p className="muted" style={{ padding: "16px 4px", fontSize: 13.5 }}>
                  Toutes vos classes sont sur la bonne voie 🎉
                </p>
              ) : (
                watchlist.map((w) => {
                  const name = `${w.firstName || ""} ${w.lastName || ""}`.trim();
                  const meta = WATCH[w.status] || WATCH.behind;
                  return (
                    <a className="watch-row" key={w.id} href={`/teacher/class/?class=${w.classId || ""}&filter=${w.status === "inactive" ? "inactive" : "behind"}`} style={{ textDecoration: "none", color: "inherit" }}>
                      <span className="avatar avatar-sm" style={{ background: w.avatarColor || avatarColor(name) }}>
                        {initials(name)}
                      </span>
                      <div className="info">
                        <div className="n">{name}</div>
                        <div className="d">{w.reason}</div>
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
            {watchlist.length > 0 && (
              <a className="card-foot-link" href="/teacher/class/">Voir tous les élèves <Icon name="chevR" /></a>
            )}
          </div>
        </div>

        {/* right column — feedback + copilot themes */}
        <aside>
          <div className="card panel" id="retours" style={{ scrollMarginTop: "90px" }}>
            <div className="panel-head">
              <div className="ph-title">
                <h3><Icon name="message" /> Retours des élèves</h3>
                <div className="ph-sub">Élèves qui ont signalé une difficulté à comprendre</div>
              </div>
              {feedback?.openCount > 0 && <span className="badge badge-warning">{feedback.openCount} à traiter</span>}
            </div>
            <div>
              {!feedback || feedback.items.length === 0 ? (
                <p className="muted" style={{ padding: "16px 4px", fontSize: 13.5 }}>Aucun retour pour le moment.</p>
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

          <div className="card panel" style={{ marginTop: "18px" }}>
            <div className="panel-head">
              <div className="ph-title">
                <h3><Icon name="sparkles" /> Principaux thèmes Copilot</h3>
                <div className="ph-sub">Notions les plus demandées au tuteur IA</div>
              </div>
              <a className="link" href="/teacher/insights/">Tout <Icon name="chevR" /></a>
            </div>
            <div>
              {topThemes.length === 0 ? (
                <p className="muted" style={{ padding: "16px 4px", fontSize: 13.5 }}>Aucune question Copilot pour l’instant.</p>
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
          </div>
        </aside>
      </div>
    </TeacherShell>
  );
}
