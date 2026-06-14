"use client";
import "./class-detail.css";
import { useState, useMemo, useEffect, useCallback } from "react";
import Icon from "@/components/ui/Icon";
import { BrandMark, OfflinePill, LangToggle, Avatar } from "@/components/ui/chrome";
import { toast } from "@/lib/toast";

const STATUS = {
  ok: { l: "Sur la bonne voie", c: "ok" },
  behind: { l: "En retard", c: "behind" },
  inactive: { l: "Inactif", c: "inactive" },
};

const NAV = [
  { href: "/teacher/", ic: "grid", lbl: "Tableau de bord" },
  { href: "/teacher/class/", ic: "users", lbl: "Mes classes", active: true },
  { href: "/teacher/insights/", ic: "sparkles", lbl: "Analyses Copilot", pill: "14" },
  { href: "/teacher/studio/", ic: "edit", lbl: "Studio de contenu" },
];

function fmtTime(m) {
  const mins = m || 0;
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return h ? `${h}h ${mm}m` : `${mm}m`;
}

function quizColor(q) {
  if (q == null) return "var(--text-muted)";
  return q >= 70 ? "var(--success-fg)" : q >= 50 ? "var(--warning-fg)" : "var(--danger-fg)";
}

function fmtQuiz(q) {
  return q == null ? "—" : `${q}%`;
}

function fmtLastActive(days) {
  if (days == null) return "Jamais";
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  return `il y a ${days} j`;
}

function fmtTimelineAt(at) {
  if (!at) return "—";
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86400000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  return `il y a ${days} j`;
}

const fullName = (s) => `${s.firstName} ${s.lastName}`;

export default function ClassDetailPage() {
  const [loading, setLoading] = useState(true);
  const [classId, setClassId] = useState(null);
  const [classInfo, setClassInfo] = useState(null); // { id, name, level, field }
  const [totalLessons, setTotalLessons] = useState(0);
  const [students, setStudents] = useState([]);

  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("progressPct");
  const [sortDir, setSortDir] = useState(-1);
  const [selected, setSelected] = useState(() => new Set());
  const [masterOn, setMasterOn] = useState(true);
  const [modal, setModal] = useState(null); // { turningOff }

  const [drawerId, setDrawerId] = useState(null);
  const [drawerData, setDrawerData] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const [modSubjects, setModSubjects] = useState([]); // [{ slug, name, modules:[{id,title,order,lessonCount,locked}] }]
  const [modOpen, setModOpen] = useState(false);

  const loadClass = useCallback(async (id) => {
    const [res, lockRes] = await Promise.all([
      fetch(`/api/teacher/classes/${id}/`),
      fetch(`/api/teacher/module-locks/?class=${id}`),
    ]);
    if (res.status === 403) {
      window.location.href = "/login/";
      return;
    }
    const data = await res.json();
    setClassInfo(data.class);
    setTotalLessons(data.totalLessons);
    setMasterOn(data.master?.enabled ?? true);
    setStudents(data.students || []);
    if (lockRes.ok) {
      const ld = await lockRes.json();
      setModSubjects(ld.subjects || []);
    }
    setLoading(false);
  }, []);

  async function toggleModuleLock(moduleId, nextLocked) {
    if (!classId) return;
    // optimistic
    setModSubjects((prev) =>
      prev.map((s) => ({ ...s, modules: s.modules.map((m) => (m.id === moduleId ? { ...m, locked: nextLocked } : m)) }))
    );
    const res = await fetch("/api/teacher/module-locks/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId, moduleId, locked: nextLocked }),
    });
    if (res.status === 403) {
      window.location.href = "/login/";
      return;
    }
    if (!res.ok) {
      // revert
      setModSubjects((prev) =>
        prev.map((s) => ({ ...s, modules: s.modules.map((m) => (m.id === moduleId ? { ...m, locked: !nextLocked } : m)) }))
      );
      toast("Impossible de mettre à jour le module", { icon: "alert" });
      return;
    }
    toast(nextLocked ? "Module verrouillé pour la classe" : "Module déverrouillé pour la classe", {
      icon: nextLocked ? "lock" : "check",
    });
  }

  const lockedCount = useMemo(
    () => modSubjects.reduce((a, s) => a + s.modules.filter((m) => m.locked).length, 0),
    [modSubjects]
  );

  useEffect(() => {
    (async () => {
      const list = await fetch("/api/teacher/classes/").then((r) =>
        r.status === 403 ? ((window.location.href = "/login/"), null) : r.json()
      );
      if (!list) return;
      const qid = new URLSearchParams(window.location.search).get("class");
      const id = qid && list.classes.some((c) => c.id === qid) ? qid : list.classes[0]?.id;
      if (!id) {
        setLoading(false);
        return;
      }
      setClassId(id);
      await loadClass(id);
    })();
  }, [loadClass]);

  // Load drawer data when a row is opened.
  useEffect(() => {
    if (drawerId == null) return;
    let alive = true;
    setDrawerLoading(true);
    setDrawerData(null);
    (async () => {
      const res = await fetch(`/api/teacher/students/${drawerId}/`);
      if (res.status === 403) {
        window.location.href = "/login/";
        return;
      }
      const data = await res.json();
      if (alive) {
        setDrawerData(data);
        setDrawerLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [drawerId]);

  // --- KPIs computed from real roster ---
  const kpis = useMemo(() => {
    const n = students.length;
    const avg = (key) => {
      const vals = students.map((s) => s[key]).filter((v) => v != null);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    };
    const avgTime = n ? Math.round(students.reduce((a, s) => a + (s.timeMinutes || 0), 0) / n) : 0;
    const copilotQ = students.reduce((a, s) => a + (s.copilotCount || 0), 0);
    return [
      { ic: "user", c: "var(--indigo-600)", bg: "var(--indigo-100)", v: String(n), l: "Élèves" },
      { ic: "trend", c: "var(--success)", bg: "var(--success-bg)", v: `${avg("progressPct")}%`, l: "Progression moy." },
      { ic: "target", c: "var(--warning)", bg: "var(--warning-bg)", v: `${avg("avgQuiz")}%`, l: "Quiz moy." },
      { ic: "clock", c: "var(--math)", bg: "var(--math-bg)", v: fmtTime(avgTime), l: "Temps moy." },
      { ic: "sparkles", c: "var(--sptic)", bg: "var(--sptic-bg)", v: String(copilotQ), l: "Q. Copilot" },
    ];
  }, [students]);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = students.filter((s) => fullName(s).toLowerCase().includes(q));
    return [...filtered].sort((a, b) => {
      let av;
      let bv;
      if (sortKey === "name") {
        av = `${a.lastName} ${a.firstName}`;
        bv = `${b.lastName} ${b.firstName}`;
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }
      if (typeof av === "string") return av.localeCompare(bv) * sortDir;
      // null-safe numeric sort (nulls go last)
      const an = av == null ? -Infinity * sortDir : av;
      const bn = bv == null ? -Infinity * sortDir : bv;
      return (an - bn) * sortDir;
    });
  }, [students, search, sortKey, sortDir]);

  function applyCopilotLocal(ids, val) {
    setStudents((prev) =>
      prev.map((s) => (ids.includes(s.id) ? { ...s, copilotEnabled: val } : s))
    );
  }

  async function putPolicy(body) {
    const res = await fetch("/api/teacher/copilot-policy/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 403) {
      window.location.href = "/login/";
      return false;
    }
    return res.ok;
  }

  function toggleSel(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function toggleCop(id) {
    const s = students.find((x) => x.id === id);
    if (!s || !classId) return;
    const val = !s.copilotEnabled;
    applyCopilotLocal([id], val); // optimistic
    if (drawerData && drawerData.student?.id === id) {
      setDrawerData((d) => (d ? { ...d, copilotEnabled: val } : d));
    }
    const ok = await putPolicy({
      scope: "STUDENT",
      classId,
      studentIds: [id],
      enabled: val,
      reason: "Per-student toggle",
    });
    if (!ok) {
      applyCopilotLocal([id], !val); // revert
      if (drawerData && drawerData.student?.id === id) {
        setDrawerData((d) => (d ? { ...d, copilotEnabled: !val } : d));
      }
      toast("Impossible de mettre à jour le Copilot", { icon: "alert" });
      return;
    }
    toast(`Copilot ${val ? "activé" : "mis en pause"} pour ${fullName(s)}`, {
      icon: val ? "sparkles" : "pause",
    });
  }

  function toggleSelAll() {
    setSelected((prev) =>
      prev.size === students.length ? new Set() : new Set(students.map((s) => s.id))
    );
  }

  function sortBy(k) {
    if (sortKey === k) setSortDir((d) => d * -1);
    else {
      setSortKey(k);
      setSortDir(k === "name" ? 1 : -1);
    }
  }

  async function bulkSet(val) {
    const ids = [...selected];
    if (ids.length === 0 || !classId) return;
    applyCopilotLocal(ids, val); // optimistic
    setSelected(new Set());
    const ok = await putPolicy({
      scope: "STUDENT",
      classId,
      studentIds: ids,
      enabled: val,
      reason: "Bulk toggle",
    });
    if (!ok) {
      await loadClass(classId);
      toast("Impossible de mettre à jour le Copilot", { icon: "alert" });
      return;
    }
    toast(
      `Copilot ${val ? "activé" : "mis en pause"} pour ${ids.length} élève${ids.length > 1 ? "s" : ""}`,
      { icon: val ? "sparkles" : "pause" }
    );
  }

  async function confirmMaster() {
    if (!classId) return;
    const next = !masterOn;
    setMasterOn(next);
    setModal(null);
    const ok = await putPolicy({ scope: "CLASS", classId, enabled: next, reason: "Master switch" });
    if (!ok) {
      setMasterOn(!next);
      toast("Impossible de mettre à jour le Copilot", { icon: "alert" });
      return;
    }
    // Server clears per-student overrides — re-fetch for true per-row states.
    await loadClass(classId);
    toast(`Copilot ${next ? "activé" : "mis en pause"} pour toute la classe`, {
      icon: next ? "sparkles" : "pause",
    });
  }

  const drStudent = drawerId == null ? null : students.find((s) => s.id === drawerId);

  const HEADERS = [
    { k: "name", label: "Élève" },
    { k: "progressPct", label: "Progression" },
    { k: "lessonsDone", label: "Leçons" },
    { k: "avgQuiz", label: "Quiz moy." },
    { k: "timeMinutes", label: "Temps" },
    { k: "copilotCount", label: "Q. Copilot" },
    { k: "lastActiveDays", label: "Dernière activité" },
  ];

  const className = classInfo?.name || "Classe";
  const lvlText = [classInfo?.level, classInfo?.field].filter(Boolean).join(" · ") || "—";

  return (
    <div className={`t-app teacher-page ${collapsed ? "collapsed" : ""}`.trim()}>
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
              <span className="lbl">{n.lbl}</span>
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
              <a href="/teacher/" style={{ color: "var(--text-muted)" }}>
                Classes
              </a>{" "}
              / <b>{className}</b>
            </div>
          </div>
          <div className="t-top-right">
            <OfflinePill label="Serveur local connecté" />
            <LangToggle
              onNotice={() =>
                toast(
                  "Le français complet arrive — interface en anglais pour cette revue.",
                  { icon: "info" }
                )
              }
            />
            <button
              className="t-iconbtn"
              onClick={() =>
                toast("3 nouvelles alertes — 2 élèves sont devenus inactifs", { icon: "bell" })
              }
            >
              <Icon name="bell" />
              <span className="dot-badge" />
            </button>
          </div>
        </header>

        <div className="t-content">
          <div className="class-hero">
            <span className="subject-tile subj-math">
              <Icon name="math" />
            </span>
            <div>
              <h1>{className}</h1>
              <div className="lvl">{lvlText}</div>
            </div>
            <div className="master">
              <div className="ml">
                Copilot de la classe <small>{masterOn ? "Activé pour tous" : "En pause pour tous"}</small>
              </div>
              <button
                className={`tg ${masterOn ? "on" : ""}`.trim()}
                disabled={loading || !classId}
                onClick={() => setModal({ turningOff: masterOn })}
              />
            </div>
          </div>

          <div className="mini-kpis">
            {kpis.map((k) => (
              <div className="mini-kpi" key={k.l}>
                <span className="ic" style={{ background: k.bg, color: k.c }}>
                  <Icon name={k.ic} />
                </span>
                <div>
                  <div className="v">{k.v}</div>
                  <div className="l">{k.l}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="card panel mod-locks">
            <button className="ml-head" onClick={() => setModOpen((o) => !o)}>
              <h3>
                <Icon name="layers" /> Accès aux modules
              </h3>
              <span className="ml-sub">
                {lockedCount === 0
                  ? "Tous les modules sont accessibles"
                  : `${lockedCount} module${lockedCount > 1 ? "s" : ""} verrouillé${lockedCount > 1 ? "s" : ""}`}
              </span>
              <span className="grow" />
              <Icon name={modOpen ? "chevD" : "chevR"} />
            </button>
            {modOpen && (
              <div className="ml-body">
                <p className="muted tiny" style={{ margin: "0 0 12px" }}>
                  Par défaut, chaque module est ouvert à tous les élèves. Verrouillez un module pour
                  en bloquer l’accès jusqu’à ce que vous le rouvriez.
                </p>
                {modSubjects.length === 0 ? (
                  <div className="muted tiny">Aucun module</div>
                ) : (
                  modSubjects.map((s) => (
                    <div className="ml-subject" key={s.slug}>
                      <div className="ml-subject-name">
                        <Icon name={s.icon || "layers"} /> {s.name}
                      </div>
                      <div className="ml-mods">
                        {s.modules.map((m) => (
                          <div className={`ml-mod ${m.locked ? "locked" : ""}`.trim()} key={m.id}>
                            <span className="ml-code">M{m.order}</span>
                            <span className="ml-title">{m.title}</span>
                            <span className="ml-count">{m.lessonCount} leçons</span>
                            <span className={`ml-state ${m.locked ? "locked" : "open"}`}>
                              <Icon name={m.locked ? "lock" : "check"} />
                              {m.locked ? "Verrouillé" : "Accessible"}
                            </span>
                            <button
                              className={`tg ${m.locked ? "" : "on"}`.trim()}
                              title={m.locked ? "Déverrouiller" : "Verrouiller"}
                              onClick={() => toggleModuleLock(m.id, !m.locked)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="tbl-toolbar">
            <div className="tbl-search">
              <Icon name="search" />
              <input
                className="input"
                placeholder="Rechercher un élève…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => toast("Filtre par statut — version démo", { icon: "filter" })}
            >
              <Icon name="filter" /> Tous les statuts
            </button>
            <span className="grow" />
            <span className="muted tiny">
              {list.length} sur {students.length} élèves
            </span>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: "42px" }}>
                    <span className="selall">
                      <span
                        className={`cbx ${
                          selected.size === students.length && students.length > 0 ? "on" : ""
                        }`.trim()}
                        onClick={toggleSelAll}
                      >
                        <Icon name="check" />
                      </span>
                    </span>
                  </th>
                  {HEADERS.map((h) => (
                    <th
                      key={h.k}
                      className={`sortable ${sortKey === h.k ? "sorted" : ""}`.trim()}
                      onClick={() => sortBy(h.k)}
                    >
                      {h.label}{" "}
                      <span className="sarrow">
                        {sortKey === h.k ? (sortDir < 0 ? "↓" : "↑") : "↕"}
                      </span>
                    </th>
                  ))}
                  <th>Statut</th>
                  <th style={{ textAlign: "center" }}>Copilot</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                      Chargement…
                    </td>
                  </tr>
                ) : list.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                      Aucun élève
                    </td>
                  </tr>
                ) : (
                  list.map((s) => {
                    const st = STATUS[s.status] || STATUS.ok;
                    const name = fullName(s);
                    return (
                      <tr
                        key={s.id}
                        className={selected.has(s.id) ? "selected" : undefined}
                        onClick={() => setDrawerId(s.id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <span
                            className={`cbx ${selected.has(s.id) ? "on" : ""}`.trim()}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSel(s.id);
                            }}
                          >
                            <Icon name="check" />
                          </span>
                        </td>
                        <td>
                          <div className="cell-name">
                            <Avatar name={name} size="avatar-sm" />
                            <span className="nm">{name}</span>
                          </div>
                        </td>
                        <td>
                          <div className="mini-bar">
                            <div className={`pbar ${s.progressPct >= 70 ? "success" : ""}`.trim()}>
                              <span style={{ width: `${s.progressPct}%` }} />
                            </div>
                            <span className="v">{s.progressPct}%</span>
                          </div>
                        </td>
                        <td>
                          {s.lessonsDone}/{totalLessons}
                        </td>
                        <td>
                          <b style={{ color: quizColor(s.avgQuiz) }}>{fmtQuiz(s.avgQuiz)}</b>
                        </td>
                        <td>{fmtTime(s.timeMinutes)}</td>
                        <td>
                          <span className="copilot-cell">
                            <span className="qn">{s.copilotCount}</span>
                          </span>
                        </td>
                        <td>
                          <span className="lastactive">{fmtLastActive(s.lastActiveDays)}</span>
                        </td>
                        <td>
                          <span className={`status-tag ${st.c}`}>
                            <span className={`sdot ${st.c}`} />
                            {st.l}
                          </span>
                        </td>
                        <td
                          onClick={(e) => e.stopPropagation()}
                          style={{ textAlign: "center" }}
                        >
                          <button
                            className={`tg ${s.copilotEnabled ? "on" : ""}`.trim()}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCop(s.id);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* bulk bar */}
      <div className={`bulkbar ${selected.size > 0 ? "show" : ""}`.trim()}>
        <span className="bcount">
          <b>{selected.size}</b> sélectionné{selected.size > 1 ? "s" : ""}
        </span>
        <span className="bsep" />
        <button
          className="btn btn-sm"
          style={{ background: "rgba(255,255,255,.14)", color: "#fff" }}
          onClick={() => bulkSet(false)}
        >
          <Icon name="pause" /> Désactiver le Copilot
        </button>
        <button
          className="btn btn-sm"
          style={{ background: "rgba(255,255,255,.14)", color: "#fff" }}
          onClick={() => bulkSet(true)}
        >
          Activer le Copilot
        </button>
        <button
          className="btn-icon"
          style={{ background: "transparent", color: "#cbd5e1", border: 0, cursor: "pointer" }}
          onClick={() => setSelected(new Set())}
        >
          <Icon name="x" />
        </button>
      </div>

      {/* drawer */}
      <div
        className={`drawer-overlay ${drStudent ? "show" : ""}`.trim()}
        onClick={() => setDrawerId(null)}
      />
      <aside className={`drawer ${drStudent ? "show" : ""}`.trim()}>
        {drStudent &&
          (() => {
            const s = drStudent;
            const st = STATUS[s.status] || STATUS.ok;
            const name = fullName(s);
            const d = drawerData;
            const metrics = d?.metrics;
            const breakdown = d?.breakdown || [];
            const timeline = d?.timeline || [];
            const topics = d?.copilotTopics || [];
            const drClassName = d?.className || className;
            return (
              <>
                <div className="drawer-head">
                  <Avatar name={name} size="avatar-lg" className="da" />
                  <div className="dmeta">
                    <h2>{name}</h2>
                    <div className="dsub">
                      {drClassName} ·{" "}
                      <span className={`status-tag ${st.c}`}>
                        <span className={`sdot ${st.c}`} />
                        {st.l}
                      </span>
                    </div>
                  </div>
                  <button className="t-iconbtn" onClick={() => setDrawerId(null)}>
                    <Icon name="x" />
                  </button>
                </div>
                <div className="drawer-body">
                  {drawerLoading || !metrics ? (
                    <div className="muted" style={{ padding: "20px", textAlign: "center" }}>
                      Chargement…
                    </div>
                  ) : (
                    <>
                      <div className="row" style={{ gap: "10px" }}>
                        <div className="mini-kpi" style={{ flex: 1 }}>
                          <span className="ic" style={{ background: "var(--success-bg)", color: "var(--success-fg)" }}>
                            <Icon name="trend" />
                          </span>
                          <div>
                            <div className="v">{metrics.progressPct}%</div>
                            <div className="l">Progression</div>
                          </div>
                        </div>
                        <div className="mini-kpi" style={{ flex: 1 }}>
                          <span className="ic" style={{ background: "var(--warning-bg)", color: "var(--warning-fg)" }}>
                            <Icon name="target" />
                          </span>
                          <div>
                            <div className="v">{fmtQuiz(metrics.avgQuiz)}</div>
                            <div className="l">Quiz moy.</div>
                          </div>
                        </div>
                        <div className="mini-kpi" style={{ flex: 1 }}>
                          <span className="ic" style={{ background: "var(--sptic-bg)", color: "var(--sptic)" }}>
                            <Icon name="sparkles" />
                          </span>
                          <div>
                            <div className="v">{metrics.copilotCount}</div>
                            <div className="l">Q. Copilot</div>
                          </div>
                        </div>
                      </div>

                      <div className="card panel">
                        <div className="panel-head">
                          <h3>
                            <Icon name="layers" /> Détail par module
                          </h3>
                        </div>
                        <div className="modbreak">
                          {breakdown.length === 0 ? (
                            <div className="muted tiny">Aucune donnée</div>
                          ) : (
                            breakdown.map((m) => (
                              <div className="mb" key={m.name}>
                                <span className="ml">
                                  <Icon name={m.icon} /> {m.name}
                                </span>
                                <div className={`pbar ${m.pct >= 70 ? "success" : ""}`.trim()}>
                                  <span style={{ width: `${m.pct}%` }} />
                                </div>
                                <span className="pv">{m.pct}%</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="card panel">
                        <div className="panel-head">
                          <h3>
                            <Icon name="history" /> Activité récente
                          </h3>
                        </div>
                        <div className="timeline-mini">
                          {timeline.length === 0 ? (
                            <div className="muted tiny">Aucune activité récente</div>
                          ) : (
                            timeline.map((e, i) => (
                              <div className="tlm-row" key={`${e.lessonTitle}-${i}`}>
                                <div className="tlm-dot" style={{ background: "var(--success)" }}>
                                  <Icon name="check" />
                                </div>
                                <div className="tlm-body">
                                  <div className="tt">{e.lessonTitle}</div>
                                  <div className="td">
                                    {e.subject} · {fmtTimelineAt(e.at)}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="card panel">
                        <div className="panel-head">
                          <h3>
                            <Icon name="sparkles" /> Sujets de conversation Copilot
                          </h3>
                        </div>
                        <div className="topic-chips">
                          {topics.length === 0 ? (
                            <span className="muted tiny">Aucune question encore</span>
                          ) : (
                            topics.map((t) => (
                              <span className="topic-chip" key={t.label}>
                                {t.label} · {t.count}
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      {(d?.feedback || []).length > 0 && (
                        <div className="card panel">
                          <div className="panel-head">
                            <h3><Icon name="message" /> Retours sur les leçons</h3>
                          </div>
                          <div>
                            {d.feedback.map((f) => (
                              <div className={`fb-row${f.resolved ? " done" : ""}`} key={f.id}>
                                <span className={`fb-pct u${f.understanding}`}>{f.understanding}%</span>
                                <div className="info">
                                  <div className="n">{f.lessonTitle}</div>
                                  {f.message && <div className="fb-msg">« {f.message} »</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="row" style={{ gap: "10px" }}>
                    <button
                      className="btn btn-secondary grow"
                      onClick={() =>
                        toast("Ouverture de l’éditeur de message…", { icon: "message" })
                      }
                    >
                      <Icon name="message" /> Envoyer un message à l’élève
                    </button>
                    <button
                      className={`btn ${s.copilotEnabled ? "btn-secondary" : "btn-primary"} grow`}
                      onClick={() => toggleCop(s.id)}
                    >
                      <Icon name={s.copilotEnabled ? "pause" : "sparkles"} />{" "}
                      {s.copilotEnabled ? "Mettre en pause le Copilot" : "Activer le Copilot"}
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
      </aside>

      {/* master switch — confirmation modal */}
      {modal &&
        (() => {
          const turningOff = modal.turningOff;
          const n = students.length;
          return (
            <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
              <div className="modal">
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", marginBottom: "6px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: turningOff ? "var(--warning-bg)" : "var(--success-bg)",
                      color: turningOff ? "var(--warning-fg)" : "var(--success-fg)",
                      display: "grid",
                      placeItems: "center",
                      flex: "none",
                    }}
                  >
                    <Icon name={turningOff ? "pause" : "sparkles"} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: "20px" }}>
                      {turningOff
                        ? "Mettre en pause le Copilot pour toute la classe ?"
                        : "Réactiver le Copilot pour toute la classe ?"}
                    </h2>
                    <p className="muted" style={{ fontSize: "14px", marginTop: "6px" }}>
                      {turningOff
                        ? `Les ${n} élèves de ${className} perdront l’accès au tuteur IA jusqu’à ce que vous le réactiviez. Ils pourront toujours lire les leçons et faire les quiz.`
                        : `Les ${n} élèves retrouveront l’accès au tuteur IA Copilot dans leurs leçons.`}
                    </p>
                  </div>
                </div>
                <div className="row" style={{ justifyContent: "flex-end", gap: "10px", marginTop: "22px" }}>
                  <button className="btn btn-secondary" onClick={() => setModal(null)}>
                    Annuler
                  </button>
                  <button
                    className={`btn ${turningOff ? "btn-danger" : "btn-success"}`}
                    onClick={confirmMaster}
                  >
                    {turningOff ? "Mettre en pause pour tous" : "Activer pour tous"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
