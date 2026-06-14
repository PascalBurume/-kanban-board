"use client";
import { useState, useEffect } from "react";
import "./teacher-dashboard.css";
import Icon from "@/components/ui/Icon";
import { BrandMark, OfflinePill, LangToggle, Avatar } from "@/components/ui/chrome";
import { avatarColor, initials } from "@/lib/icons";
import { toast } from "@/lib/toast";
import BarChart from "@/components/ui/BarChart";

// Static KPI presentation (icons/colours/labels). Numbers come from the API.
const KPI_DEFS = [
  { key: "classes", ic: "users", c: "var(--indigo-600)", bg: "var(--indigo-100)", label: "Classes", suffix: "" },
  { key: "students", ic: "user", c: "var(--math)", bg: "var(--math-bg)", label: "Élèves", suffix: "" },
  { key: "avgProgress", ic: "trend", c: "var(--success)", bg: "var(--success-bg)", label: "Progression moy.", suffix: "%" },
  { key: "inactive7", ic: "clock", c: "var(--warning)", bg: "var(--warning-bg)", label: "Inactifs 7+ j", suffix: "" },
  { key: "copilotWeek", ic: "sparkles", c: "var(--sptic)", bg: "var(--sptic-bg)", label: "Questions Copilot (semaine)", suffix: "" },
];

// API kpis keys → KPI_DEFS keys.
const KPI_SOURCE = {
  classes: "classes",
  students: "students",
  avgProgress: "avgProgress",
  inactive7: "inactive7",
  copilotWeek: "copilotWeek",
};

// alert.type → class card alert styling (existing classes only).
const ALERT_CLASS = { ok: "ok", warning: "", danger: "danger" };

// watchlist status → existing "why" badge colour map.
const WC = {
  danger: { background: "var(--danger-bg)", color: "var(--danger-fg)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning-fg)" },
};
const STATUS_WC = { behind: "warning", inactive: "danger" };
const STATUS_LABEL = { behind: "Bloqué", inactive: "Inactif" };

// Known subject slugs that have both an icon and a subject-tile colour.
const SUBJECTS = ["math", "physique", "chimie", "svt", "sptic"];
function subjectSlug(field) {
  const f = (field || "").toLowerCase();
  return SUBJECTS.find((s) => f.includes(s)) || "math";
}

const CHART_KEYS = ["Lessons", "Time", "Quizzes"];
const CHART_SERIES = { Lessons: "lessons", Time: "minutes", Quizzes: "quizzes" };
const CHART_LABELS = { Lessons: "Leçons", Time: "Temps", Quizzes: "Quiz" };

export default function TeacherDashboard() {
  const [collapsed, setCollapsed] = useState(false);
  const [chartKey, setChartKey] = useState("Lessons");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

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

  const teacherName = `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim();
  const firstName = teacher.firstName || "";

  // Selected weekly series → chart points; bar heights scale to series max.
  const seriesKey = CHART_SERIES[chartKey];
  const series = weekly[seriesKey] || [];
  const chartData = (weekly.days || []).map((d, i) => ({ d, v: Number(series[i]) || 0 }));
  const max = chartData.length ? Math.max(...chartData.map((p) => p.v), 1) : 1;

  return (
    <div className={`t-app teacher-page ${collapsed ? "collapsed" : ""}`.trim()}>
      {/* Sidebar */}
      <aside className="t-side">
        <div className="t-side-top">
          <BrandMark />
          <span className="nm">Mwalimu</span>
        </div>
        <nav className="t-nav">
          <span className="grouplabel">Enseignement</span>
          <a href="/teacher/" className="active">
            <Icon name="grid" />
            <span className="lbl">Tableau de bord</span>
          </a>
          <a href="/teacher/class/">
            <Icon name="users" />
            <span className="lbl">Mes classes</span>
          </a>
          <a href="/teacher/insights/">
            <Icon name="sparkles" />
            <span className="lbl">Analyses Copilot</span>
            <span className="pill">14</span>
          </a>
          <a href="/teacher/studio/">
            <Icon name="edit" />
            <span className="lbl">Studio de contenu</span>
          </a>
          <span className="grouplabel">Compte</span>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              toast("Paramètres — version démo", { icon: "info" });
            }}
          >
            <Icon name="settings" />
            <span className="lbl">Paramètres</span>
          </a>
        </nav>
        <div className="t-side-foot">
          <div className="t-userbox">
            <Avatar name={teacherName || "Grâce Mukendi"} size="avatar-sm" />
            <a className="meta" href="/profile/" style={{textDecoration:"none",color:"inherit"}}>
              <div className="un">{teacherName ? `Mme ${teacherName}` : "Mme Grâce Mukendi"}</div>
              <div className="ur">Enseignante · Mathématiques</div>
            </a>
            <a className="lo" href="/api/auth/logout/" title="Se déconnecter">
              <Icon name="logout" />
            </a>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="t-main">
        <header className="t-top">
          <div className="t-top-left">
            <button className="t-burger" onClick={() => setCollapsed((c) => !c)}>
              <Icon name="grid" />
            </button>
            <div className="t-crumb">
              Enseignement<b>Tableau de bord</b>
            </div>
          </div>
          <div className="t-top-right">
            <OfflinePill label="Serveur local connecté" />
            <LangToggle
              onNotice={() =>
                toast("Le français complet arrive — interface en anglais pour cette revue.", { icon: "info" })
              }
            />
            <button
              className="t-iconbtn"
              onClick={() => toast("3 nouvelles alertes — 2 élèves sont devenus inactifs", { icon: "bell" })}
            >
              <Icon name="bell" />
              <span className="dot-badge" />
            </button>
          </div>
        </header>

        <div className="t-content">
          <div className="row between wrap" style={{ marginBottom: "20px", gap: "14px" }}>
            <div>
              <h1 style={{ fontSize: "26px" }}>
                Bonjour{firstName ? `, ${firstName}` : ""} 👋
              </h1>
              <p className="muted" style={{ marginTop: "5px" }}>
                Voici l’évolution de vos {kpis.classes ?? classes.length} classes cette semaine.
              </p>
            </div>
            <div className="row" style={{ gap: "10px" }}>
              <button
                className="btn btn-secondary"
                onClick={() => toast("Exportation du rapport hebdomadaire…", { icon: "download" })}
              >
                <Icon name="download" /> Rapport hebdomadaire
              </button>
              <a className="btn btn-primary" href="/teacher/studio/">
                <Icon name="edit" /> Ouvrir le studio
              </a>
            </div>
          </div>

          {/* KPIs */}
          <div className="kpi-grid">
            {KPI_DEFS.map((k) => {
              const raw = kpis[KPI_SOURCE[k.key]];
              const val = raw == null ? (loading ? "—" : "0") : `${raw}${k.suffix}`;
              return (
                <div className="card kpi" key={k.key}>
                  <div className="kt">
                    <span className="kic" style={{ background: k.bg, color: k.c }}>
                      <Icon name={k.ic} />
                    </span>
                    <span className="klabel">{k.label}</span>
                  </div>
                  <div className="kval">{val}</div>
                  <span className="kdelta" style={{ color: "var(--text-muted)" }}>
                    Toutes les classes
                  </span>
                </div>
              );
            })}
          </div>

          <div className="dash-grid">
            {/* left */}
            <div>
              <div className="sec-h">
                <h2>Vos classes</h2>
                <a
                  className="link"
                  href="/teacher/class/"
                  style={{ fontSize: "13px", fontWeight: 600, color: "var(--primary)" }}
                >
                  Tout voir →
                </a>
              </div>
              <div className="class-cards">
                {classes.map((c) => {
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
                          <div className="lvl">
                            {[c.level, c.field].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <span className="badge">{c.studentCount} élèves</span>
                      </div>
                      <div className="tc-stats">
                        <div className="st">
                          <span className="v">{c.avgProgress}%</span>
                          <span className="l">PROGRESSION</span>
                        </div>
                        <div className="st">
                          <span className="v">{c.alert?.type === "ok" ? "✓" : "!"}</span>
                          <span className="l">STATUT</span>
                        </div>
                        <div className="st">
                          <span className="v">{c.studentCount}</span>
                          <span className="l">ÉLÈVES</span>
                        </div>
                      </div>
                      <div className={`alert ${ALERT_CLASS[alertType] || ""}`.trim()}>
                        <Icon name={alertType === "ok" ? "check" : "alert"} /> {c.alert?.text}
                      </div>
                      <div className="tc-foot">
                        <div className="progress-wrap">
                          <div className="pbar">
                            <span style={{ width: `${c.avgProgress}%` }} />
                          </div>
                          <span className="v">{c.avgProgress}%</span>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>

              <div className="sec-h">
                <h2>Activité hebdomadaire</h2>
                <div className="pill-tabs">
                  {CHART_KEYS.map((key) => (
                    <button
                      key={key}
                      className={chartKey === key ? "active" : ""}
                      onClick={() => setChartKey(key)}
                    >
                      {CHART_LABELS[key]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card panel">
                <BarChart
                  data={chartData.map((d) => ({ label: d.d, value: d.v, highlight: d.v === max }))}
                  unit={chartKey === "Time" ? "min" : ""}
                  height={180}
                  ariaLabel={`Activité hebdomadaire — ${CHART_LABELS[chartKey]}`}
                />
              </div>
            </div>

            {/* right */}
            <aside>
              <div className="card panel" style={{ marginBottom: "18px" }}>
                <div className="panel-head">
                  <h3>
                    <Icon name="alert" /> À surveiller
                  </h3>
                  <span className="badge badge-danger">{watchlist.length} élèves</span>
                </div>
                <div>
                  {watchlist.map((w) => {
                    const name = `${w.firstName || ""} ${w.lastName || ""}`.trim();
                    const wc = STATUS_WC[w.status] || "warning";
                    return (
                      <div className="watch-row" key={w.id}>
                        <span
                          className="avatar avatar-sm"
                          style={{ background: w.avatarColor || avatarColor(name) }}
                        >
                          {initials(name)}
                        </span>
                        <div className="info">
                          <div className="n">{name}</div>
                          <div className="d">{w.reason}</div>
                        </div>
                        <span className="why" style={WC[wc]}>
                          {STATUS_LABEL[w.status] || w.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card panel" style={{ marginBottom: "18px" }}>
                <div className="panel-head">
                  <h3>
                    <Icon name="message" /> Retours des élèves
                  </h3>
                  {feedback?.openCount > 0 && <span className="badge badge-warning">{feedback.openCount} à traiter</span>}
                </div>
                <div>
                  {!feedback || feedback.items.length === 0 ? (
                    <p className="muted" style={{ padding: "12px 4px", fontSize: 13 }}>Aucun retour pour le moment.</p>
                  ) : (
                    feedback.items.slice(0, 6).map((f) => (
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
              </div>

              <div className="card panel">
                <div className="panel-head">
                  <h3>
                    <Icon name="sparkles" /> Principaux thèmes Copilot
                  </h3>
                  <a className="link" href="/teacher/insights/">
                    Tout <Icon name="chevR" />
                  </a>
                </div>
                <div>
                  {topThemes.map((t, i) => (
                    <div className="theme-row" key={`${t.label}-${i}`}>
                      <span className="theme-rank">{i + 1}</span>
                      <span className="tt">
                        {t.label}
                        <small>{t.subject}</small>
                      </span>
                      <span className="cnt">{t.count}×</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
