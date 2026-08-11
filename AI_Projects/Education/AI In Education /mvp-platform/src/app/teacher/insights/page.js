"use client";
import { useState, useEffect } from "react";
import "./insights.css";
import Icon from "@/components/ui/Icon";
import TeacherShell from "@/components/ui/TeacherShell";
import BarChart from "@/components/ui/BarChart";

const SUBJECT_ICONS = new Set(["math", "svt", "sptic", "chimie", "physique"]);

// Severity from a theme's share of the busiest theme's volume.
function clusterLevel(count, max) {
  if (max <= 0) return "low";
  const t = count / max;
  if (t >= 0.66) return "high";
  if (t >= 0.33) return "mid";
  return "low";
}
const SEV_LABEL = { high: "Critique", mid: "À surveiller", low: "Mineur" };

const HOUR_FROM = 7;
const HOUR_TO = 18;
const EMPTY = { kpis: { questions: 0, students: 0, themes: 0, peakHour: null }, clusters: [], topQuestions: [], heatmap: { cells: [], max: 0 }, usageByHour: Array(24).fill(0) };

export default function InsightsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(EMPTY);
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(""); // "" = toutes les classes
  const [days, setDays] = useState(30); // rolling window; 0 = tout l'historique
  const [openModules, setOpenModules] = useState(null); // null = use default (busiest module open)
  const [openLessons, setOpenLessons] = useState(() => new Set());
  const [openSevs, setOpenSevs] = useState(null); // null = use default (high + mid open)

  useEffect(() => {
    fetch("/api/teacher/classes/")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setClasses(d.classes || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setOpenModules(null); // reset accordion to the default when switching class
    setOpenLessons(new Set());
    const p = new URLSearchParams();
    if (classId) p.set("class", classId);
    p.set("days", String(days));
    fetch(`/api/teacher/insights/?${p.toString()}`)
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
  }, [classId, days]);

  const kpis = data.kpis || EMPTY.kpis;
  const clusters = data.clusters || [];
  const modules = data.modules || [];
  const usageByHour = data.usageByHour || EMPTY.usageByHour;

  // Default-open the busiest module (derived — no setState in render/effect).
  const defaultOpen = modules.length ? new Set([modules[0].moduleId]) : new Set();
  const openMods = openModules ?? defaultOpen;
  const toggleModule = (id) => { const n = new Set(openMods); n.has(id) ? n.delete(id) : n.add(id); setOpenModules(n); };
  const toggleLesson = (id) => setOpenLessons((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const maxModule = modules.reduce((m, x) => Math.max(m, x.total || 0), 0);
  const clusterMax = clusters.reduce((m, c) => Math.max(m, c.count || 0), 0);
  const totalStudents = classes.reduce((s, c) => s + (c.studentCount || 0), 0);

  // Group the AI themes by severity so a long list (many students → many themes)
  // stays scannable: critical themes up top, the long tail collapsible.
  const SEV_ORDER = ["high", "mid", "low"];
  const sevGroups = SEV_ORDER
    .map((lvl) => {
      const items = clusters
        .map((c, i) => ({ ...c, _i: i, _lvl: clusterLevel(c.count || 0, clusterMax) }))
        .filter((c) => c._lvl === lvl);
      const questions = items.reduce((s, c) => s + (c.count || 0), 0);
      return { lvl, items, questions };
    })
    .filter((g) => g.items.length > 0);
  const defaultSevs = new Set(["high", "mid"]); // critical + watch open; minor collapsed
  const openSev = openSevs ?? defaultSevs;
  const toggleSev = (lvl) => { const n = new Set(openSev); n.has(lvl) ? n.delete(lvl) : n.add(lvl); setOpenSevs(n); };

  const KPIS = [
    { ic: "message", c: "var(--indigo-600)", bg: "var(--indigo-100)", val: String(kpis.questions ?? 0), label: "Questions posées", sub: "au tuteur IA" },
    { ic: "users", c: "var(--math)", bg: "var(--math-bg)", val: totalStudents ? `${kpis.students ?? 0}/${totalStudents}` : String(kpis.students ?? 0), label: "Élèves actifs", sub: "ont demandé de l’aide" },
    { ic: "sparkles", c: "var(--sptic)", bg: "var(--sptic-bg)", val: String(kpis.themes ?? 0), label: "Thèmes détectés", sub: "regroupés par l’IA" },
    { ic: "clock", c: "var(--success)", bg: "var(--success-bg)", val: kpis.peakHour != null ? `${kpis.peakHour} h` : "—", label: "Heure de pointe", sub: "pic d’activité" },
  ];

  const hourSlots = [];
  for (let h = HOUR_FROM; h <= HOUR_TO; h++) hourSlots.push(h);

  const filters = (
    <div className="filters">
      <div className="select-pill">
        <Icon name="users" />
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filtrer par classe">
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="select-pill">
        <Icon name="calendar" />
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Période analysée">
          <option value={7}>7 derniers jours</option>
          <option value={30}>30 derniers jours</option>
          <option value={90}>90 derniers jours</option>
          <option value={0}>Tout l’historique</option>
        </select>
      </div>
    </div>
  );

  return (
    <TeacherShell active="/teacher/insights/" crumbGroup="Enseignement" crumbPage="Analyses Copilot">
      <div className="ins-top">
        <div>
          <h1>Analyses Copilot</h1>
          <p className="muted" style={{ marginTop: "5px" }}>
            Ce que vos élèves demandent au tuteur IA — regroupé automatiquement par le modèle local.
          </p>
        </div>
        {filters}
      </div>

      {/* KPI strip */}
      <div className="ins-kpis">
        {KPIS.map((k) => (
          <div className="card ins-kpi" key={k.label}>
            <span className="ik-ic" style={{ background: k.bg, color: k.c }}>
              <Icon name={k.ic} />
            </span>
            <div className="ik-body">
              <div className="ik-val">{k.val}</div>
              <div className="ik-lbl">{k.label}</div>
              <div className="ik-sub">{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Questions par module → leçon → vraies questions (drill-down) */}
      <section className="qm-section">
        <div className="ins-sec-h">
          <div>
            <h2>Questions par module</h2>
            <p className="muted">Ouvrez un module pour voir, leçon par leçon, ce que vos élèves ont demandé au tuteur.</p>
          </div>
          <span className="ai-badge"><Icon name="sparkles" /> Regroupé par leçon</span>
        </div>
        <div className="card qm-list">
          {modules.length === 0 ? (
            <div className="qm-empty">{loading ? "Chargement…" : "Pas encore de questions Copilot."}</div>
          ) : (
            modules.map((mod) => {
              const open = openMods.has(mod.moduleId);
              const maxLesson = mod.lessons.reduce((m, l) => Math.max(m, l.count || 0), 0);
              const subj = SUBJECT_ICONS.has(mod.subjectIcon) ? mod.subjectIcon : "book";
              return (
                <div className={`qm-mod ${open ? "open" : ""}`.trim()} key={mod.moduleId}>
                  <button className="qm-mod-head" onClick={() => toggleModule(mod.moduleId)} aria-expanded={open}>
                    <span className={`subject-tile subj-${subj}`}><Icon name={subj} /></span>
                    <span className="qm-mod-info">
                      <span className="qm-mod-title">{mod.moduleTitle}</span>
                      <span className="qm-mod-sub">{mod.lessons.length} leçon{mod.lessons.length > 1 ? "s" : ""} concernée{mod.lessons.length > 1 ? "s" : ""} · {mod.total} questions</span>
                    </span>
                    <span className="qm-mod-bar"><span style={{ width: maxModule ? `${Math.max(6, Math.round((mod.total / maxModule) * 100))}%` : 0 }} /></span>
                    <span className="qm-mod-count">{mod.total}</span>
                    <span className="qm-chev"><Icon name="chevD" /></span>
                  </button>
                  {open && (
                    <div className="qm-lessons">
                      {mod.lessons.map((l) => {
                        const lopen = openLessons.has(l.lessonId);
                        return (
                          <div className={`qm-les ${lopen ? "open" : ""}`.trim()} key={l.lessonId}>
                            <div className="qm-les-head">
                              <button className="qm-les-toggle" onClick={() => toggleLesson(l.lessonId)} aria-expanded={lopen}>
                                <span className="qm-chev sm"><Icon name="chevR" /></span>
                                <span className="qm-les-title">{l.lessonTitle}</span>
                                <span className="qm-les-bar"><span style={{ width: maxLesson ? `${Math.max(6, Math.round((l.count / maxLesson) * 100))}%` : 0 }} /></span>
                                <span className="qm-les-count">{l.count}</span>
                                <span className="qm-les-students">{l.students} élève{l.students > 1 ? "s" : ""}</span>
                              </button>
                              <a className="btn btn-sm btn-secondary qm-les-action" href={`/teacher/studio/?lesson=${l.lessonId}&topic=${encodeURIComponent(l.lessonTitle)}`}>
                                <Icon name="edit" /> Mini-leçon
                              </a>
                            </div>
                            {lopen && (
                              <ul className="qm-questions">
                                {l.questions.map((q, qi) => (
                                  <li className="qm-q" key={qi}>
                                    <span className="qm-q-text">« {q.text} »</span>
                                    <span className="qm-q-meta">{q.count}× · {q.students} élève{q.students > 1 ? "s" : ""}</span>
                                  </li>
                                ))}
                                {l.moreQuestions > 0 && <li className="qm-more">+{l.moreQuestions} autre{l.moreQuestions > 1 ? "s" : ""} question{l.moreQuestions > 1 ? "s" : ""}</li>}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      <div className="ins-grid">
        {/* hero — misconception themes */}
        <section>
          <div className="ins-sec-h">
            <div>
              <h2>Où vos élèves butent le plus</h2>
              <p className="muted">Thèmes d’incompréhension détectés à partir de leurs questions au tuteur.</p>
            </div>
            <span className="ai-badge"><Icon name="sparkles" /> Regroupement IA</span>
          </div>

          {clusters.length === 0 ? (
            <div className="theme-list">
              <div className="card ins-empty">
                <Icon name="sparkles" />
                <div>
                  <b>{loading ? "Chargement…" : "Pas encore de questions Copilot"}</b>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Les thèmes apparaîtront dès que vos élèves utiliseront le tuteur IA.</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="sev-groups">
              {sevGroups.map((g) => {
                const open = openSev.has(g.lvl);
                return (
                  <div className={`sev-group sev-${g.lvl} ${open ? "open" : ""}`} key={g.lvl}>
                    <button type="button" className="sev-group-head" onClick={() => toggleSev(g.lvl)} aria-expanded={open}>
                      <span className={`sev-dot sev-${g.lvl}`} />
                      <span className="sev-group-title">{SEV_LABEL[g.lvl]}</span>
                      <span className="sev-group-count">{g.items.length} thème{g.items.length > 1 ? "s" : ""}</span>
                      <span className="sev-group-q">{g.questions} questions</span>
                      <span className="qm-chev"><Icon name="chevD" /></span>
                    </button>
                    {open && (
                      <div className="theme-list">
                        {g.items.map((c) => {
                          const pct = clusterMax ? Math.max(6, Math.round(((c.count || 0) / clusterMax) * 100)) : 0;
                          const topLesson = (c.lessons || [])[0];
                          const lessons = (c.lessons || []).slice(0, 3).map((l) => l.title).join(" · ");
                          return (
                            <div className={`theme-card sev-${c._lvl}`} key={c.key}>
                              <div className="tc-rank">{c._i + 1}</div>
                              <div className="tc-main">
                                <div className="tc-q">{c.label}</div>
                                <div className="tc-bar"><span style={{ width: `${pct}%` }} /></div>
                                <div className="tc-meta">
                                  <span className={`sev-pill sev-${c._lvl}`}>{SEV_LABEL[c._lvl]}</span>
                                  <span><b>{c.count}</b> questions</span>
                                  <span className="dot">·</span>
                                  <span><b>{c.students}</b> élèves concernés</span>
                                </div>
                                {c.keywords && c.keywords.length > 0 && (
                                  <div className="tc-tags">
                                    {c.keywords.map((kw) => <span className="tag" key={kw}>{kw}</span>)}
                                  </div>
                                )}
                                {lessons && (
                                  <div className="tc-lessons"><Icon name="book" /> Surtout dans : {lessons}</div>
                                )}
                              </div>
                              <a
                                className="btn btn-sm btn-primary tc-action"
                                href={`/teacher/studio/${topLesson?.lessonId ? `?lesson=${topLesson.lessonId}&` : "?"}topic=${encodeURIComponent(c.label)}`}
                              >
                                <Icon name="plus" /> Mini-leçon
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* secondary chart */}
        <aside className="ins-side">
          <div className="card panel">
            <div className="panel-head">
              <div className="ph-title">
                <h3><Icon name="clock" /> Activité par heure</h3>
                <div className="ph-sub">Quand vos élèves demandent de l’aide</div>
              </div>
              {kpis.peakHour != null && <span className="badge">Pic {kpis.peakHour} h</span>}
            </div>
            <BarChart
              data={hourSlots.map((h) => ({ label: String(h), value: usageByHour[h] || 0, highlight: h === kpis.peakHour }))}
              height={150}
              formatValue={(v) => String(v)}
              gridLines={2}
              ariaLabel="Questions Copilot par heure (7 h à 18 h)"
              emptyLabel="Aucune question pour l’instant."
            />
          </div>
        </aside>
      </div>
    </TeacherShell>
  );
}
