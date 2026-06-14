"use client";
import { useState, useEffect } from "react";
import "./insights.css";
import Icon from "@/components/ui/Icon";
import { BrandMark, OfflinePill, LangToggle, Avatar } from "@/components/ui/chrome";
import { toast } from "@/lib/toast";
import BarChart from "@/components/ui/BarChart";

const SUBJECT_ICONS = new Set(["math", "svt", "sptic", "chimie", "physique"]);

// Interpolate the original heat colouring: lightness 92% → 40% as count/max → 1.
function heatColor(count, max) {
  if (!count) return null;
  const t = max > 0 ? count / max : 0;
  const l = 92 - t * 52;
  return `hsl(244 75% ${l}%)`;
}

// Cluster border severity is derived from rank/share (no level in the API).
function clusterLevel(count, max) {
  if (max <= 0) return "low";
  const t = count / max;
  if (t >= 0.66) return "high";
  if (t >= 0.33) return "mid";
  return "low";
}

function formatHour(h) {
  if (h === null || h === undefined) return "—";
  return `${h} h`;
}

const SCALE = [0.15, 0.35, 0.55, 0.75, 0.95];

// School-hours window for the usage chart (7h → 18h inclusive).
const HOUR_FROM = 7;
const HOUR_TO = 18;

const NAV = [
  { href: "/teacher/", ic: "grid", label: "Tableau de bord" },
  { href: "/teacher/class/", ic: "users", label: "Mes classes" },
  { href: "/teacher/insights/", ic: "sparkles", label: "Analyses Copilot", active: true },
  { href: "/teacher/studio/", ic: "edit", label: "Studio de contenu" },
];

const EMPTY = { kpis: { questions: 0, students: 0, themes: 0, peakHour: null }, clusters: [], topQuestions: [], heatmap: { cells: [], max: 0 }, usageByHour: Array(24).fill(0) };

export default function InsightsPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(EMPTY);

  useEffect(() => {
    fetch("/api/teacher/insights/")
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
  }, []);

  const kpis = data.kpis || EMPTY.kpis;
  const clusters = data.clusters || [];
  const topQuestions = data.topQuestions || [];
  const heatmap = data.heatmap || EMPTY.heatmap;
  const usageByHour = data.usageByHour || EMPTY.usageByHour;

  const KPIS = [
    { ic: "message", c: "var(--indigo-600)", bg: "var(--indigo-100)", label: "Questions posées", val: String(kpis.questions ?? 0) },
    { ic: "users", c: "var(--math)", bg: "var(--math-bg)", label: "Élèves actifs", val: String(kpis.students ?? 0) },
    { ic: "alert", c: "var(--warning)", bg: "var(--warning-bg)", label: "Thèmes d’incompréhension", val: String(kpis.themes ?? 0) },
    { ic: "clock", c: "var(--success)", bg: "var(--success-bg)", label: "Heure la plus active", val: formatHour(kpis.peakHour) },
  ];

  const clusterMax = clusters.reduce((m, c) => Math.max(m, c.count || 0), 0);
  const heatMax = heatmap.max || 0;
  const hourSlots = [];
  for (let h = HOUR_FROM; h <= HOUR_TO; h++) hourSlots.push(h);

  return (
    <div className={`t-app teacher-page${collapsed ? " collapsed" : ""}`}>
      <aside className="t-side">
        <div className="t-side-top">
          <BrandMark />
          <span className="nm">Mwalimu</span>
        </div>
        <nav className="t-nav">
          <span className="grouplabel">Enseignement</span>
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={n.active ? "active" : undefined}>
              <Icon name={n.ic} />
              <span className="lbl">{n.label}</span>
              {n.pill && <span className="pill">{n.pill}</span>}
            </a>
          ))}
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
            <Avatar name="Grâce Mukendi" size="avatar-sm" />
            <a className="meta" href="/profile/" style={{textDecoration:"none",color:"inherit"}}>
              <div className="un">Mme Grâce Mukendi</div>
              <div className="ur">Enseignante · Mathématiques</div>
            </a>
            <a className="lo" href="/api/auth/logout/" title="Se déconnecter">
              <Icon name="logout" />
            </a>
          </div>
        </div>
      </aside>

      <div className="t-main">
        <header className="t-top">
          <div className="t-top-left">
            <button className="t-burger" onClick={() => setCollapsed((c) => !c)}>
              <Icon name="grid" />
            </button>
            <div className="t-crumb">
              Enseignement<b>Analyses Copilot</b>
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
          <div className="ins-top">
            <div>
              <h1>Analyses Copilot</h1>
              <p className="muted" style={{ marginTop: "5px" }}>
                Ce que les élèves ont demandé au tuteur IA — et où ils butent.
              </p>
            </div>
            <div className="filters">
              <span className="select-pill" onClick={() => toast("Filtre par classe — démo", { icon: "filter" })}>
                5e Scientifique A <Icon name="chevD" />
              </span>
              <span className="select-pill" onClick={() => toast("Filtre par période — démo", { icon: "calendar" })}>
                Cette semaine <Icon name="chevD" />
              </span>
            </div>
          </div>

          {/* KPI strip */}
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
            {KPIS.map((k) => (
              <div className="card kpi" key={k.label}>
                <div className="kt">
                  <span className="kic" style={{ background: k.bg, color: k.c }}>
                    <Icon name={k.ic} />
                  </span>
                  <span className="klabel">{k.label}</span>
                </div>
                <div className="kval">{k.val}</div>
              </div>
            ))}
          </div>

          <div className="ins-grid" style={{ marginTop: "22px" }}>
            {/* left column */}
            <div>
              <div className="sec-h" style={{ marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ fontSize: "18px" }}>
                  Thèmes d’incompréhension{" "}
                  <span className="badge badge-warning" style={{ verticalAlign: "middle" }}>
                    regroupement auto
                  </span>
                </h2>
              </div>
              <div className="col" style={{ gap: "14px" }}>
                {clusters.length === 0 ? (
                  <div className="card cluster low">
                    <div className="ctop">
                      <span className="cic">
                        <Icon name="sparkles" />
                      </span>
                      <div style={{ flex: 1 }}>
                        <h3>Pas encore de questions Copilot</h3>
                        <div className="cmeta">
                          {loading ? "Chargement…" : "Les thèmes apparaîtront ici dès que vos élèves utiliseront le tuteur IA."}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  clusters.map((c) => {
                    const lvl = clusterLevel(c.count || 0, clusterMax);
                    const topLesson = (c.lessons && c.lessons[0]) || null;
                    return (
                      <div className={`card cluster ${lvl}`} key={c.key}>
                        <div className="ctop">
                          <span className="cic">
                            <Icon name={lvl === "low" ? "check" : "alert"} />
                          </span>
                          <div style={{ flex: 1 }}>
                            <h3>{c.label}</h3>
                            <div className="cmeta">
                              {c.count} questions · {c.students} élèves
                              {topLesson ? ` · ${topLesson.title} (${topLesson.subject})` : ""}
                            </div>
                          </div>
                        </div>
                        {c.keywords && c.keywords.length > 0 && (
                          <div className="cbody" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {c.keywords.map((kw) => (
                              <span className="badge" key={kw}>
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="cfoot">
                          <div className="cmeta">{topLesson ? topLesson.title : ""}</div>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => toast("Brouillon de mini-leçon préparé dans le Studio.", { icon: "sparkles" })}
                          >
                            <Icon name="plus" /> Créer une mini-leçon
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="sec-h" style={{ margin: "26px 0 14px" }}>
                <h2 style={{ fontSize: "18px" }}>Confusion par leçon</h2>
              </div>
              <div className="card panel">
                <div className="heat">
                  {heatmap.cells.length === 0 ? (
                    <div className="hlabel" style={{ textAlign: "left", whiteSpace: "normal" }}>
                      {loading ? "Chargement…" : "Aucune donnée pour le moment."}
                    </div>
                  ) : (
                    heatmap.cells.map((cell, i) => {
                      const col = heatColor(cell.count, heatMax);
                      const hasIcon = cell.icon && SUBJECT_ICONS.has(cell.icon);
                      return (
                        <div key={`${cell.title}-${i}`} style={{ display: "contents" }}>
                          <div className="hlabel" title={cell.title}>
                            {hasIcon && <Icon name={cell.icon} />} {cell.title}
                          </div>
                          <div className="hcells">
                            <div
                              className={`hcell ${cell.count === 0 ? "empty" : ""}`.trim()}
                              style={col ? { background: col } : undefined}
                              title={`${cell.title} · ${cell.subject}`}
                            >
                              {cell.count || ""}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="heat-legend">
                  Moins de questions
                  <div className="scale">
                    {SCALE.map((t) => (
                      <div className="sc" key={t} style={{ background: `hsl(244 75% ${92 - t * 52}%)` }} />
                    ))}
                  </div>
                  Plus
                </div>
              </div>
            </div>

            {/* right column */}
            <aside>
              <div className="card panel" style={{ marginBottom: "18px" }}>
                <div className="panel-head">
                  <h3>
                    <Icon name="message" /> Questions fréquentes cette semaine
                  </h3>
                </div>
                <div>
                  {topQuestions.length === 0 ? (
                    <div className="q-row">
                      <span className="qtext">{loading ? "Chargement…" : "Aucune question pour le moment."}</span>
                    </div>
                  ) : (
                    topQuestions.map((q, i) => (
                      <div className="q-row" key={`${q.text}-${i}`}>
                        <span className="qrank">{i + 1}</span>
                        <span className="qtext">
                          &quot;{q.text}&quot;<span className="qm">{q.students} élèves</span>
                        </span>
                        <span className="qcount">{q.count}×</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card panel">
                <div className="panel-head">
                  <h3>
                    <Icon name="clock" /> Utilisation par heure
                  </h3>
                  {kpis.peakHour !== null && kpis.peakHour !== undefined && (
                    <span className="badge">Pic {formatHour(kpis.peakHour)}</span>
                  )}
                </div>
                <BarChart
                  data={hourSlots.map((h) => ({ label: `${h}h`, value: usageByHour[h] || 0, highlight: h === kpis.peakHour }))}
                  height={140}
                  showValues={false}
                  formatValue={(v) => `${v} question${v > 1 ? "s" : ""}`}
                  ariaLabel="Questions Copilot par heure (7 h à 18 h)"
                  emptyLabel="Aucune question pour l’instant."
                />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
