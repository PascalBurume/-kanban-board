"use client";
import { useState, useEffect, useMemo } from "react";
import "./feedback.css";
import Icon from "@/components/ui/Icon";
import TeacherShell from "@/components/ui/TeacherShell";
import { Avatar } from "@/components/ui/chrome";

// Short human label for an understanding score (0 | 25 | 50 | 75 | 100).
const U_LABEL = { 0: "Perdu", 25: "Perdu", 50: "Fragile", 75: "Presque", 100: "Compris" };
// A feedback still "needs attention" when it isn't resolved and the student
// reported less than full understanding — same rule as the dashboard badge.
const isOpen = (f) => !f.resolved && f.understanding < 100;
const uLevel = (u) => (u >= 100 ? "u100" : u >= 75 ? "u75" : u >= 50 ? "u50" : "u25");

const STATUS_TABS = [
  { key: "open", label: "À traiter" },
  { key: "resolved", label: "Traités" },
  { key: "all", label: "Tous" },
];

export default function FeedbackPage() {
  const [data, setData] = useState(null); // { items, openCount }
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("open"); // open | resolved | all
  const [klass, setKlass] = useState(""); // "" = toutes les classes (classId)
  const [subject, setSubject] = useState(""); // "" = toutes les matières
  const [busy, setBusy] = useState(() => new Set());

  useEffect(() => {
    setLoading(true);
    fetch("/api/teacher/feedback/")
      .then((r) => (r.status === 403 ? ((window.location.href = "/login/"), null) : r.json()))
      .then((d) => d && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function resolve(id) {
    setBusy((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/teacher/feedback/${id}/resolve/`, { method: "POST" });
      if (res.ok) {
        setData((d) => ({
          ...d,
          items: d.items.map((it) => (it.id === id ? { ...it, resolved: true } : it)),
        }));
      }
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  const items = data?.items || [];
  // Distinct classes present in the feedback (id + name), for the class filter.
  const classList = useMemo(() => {
    const m = new Map();
    for (const i of items) if (i.classId && !m.has(i.classId)) m.set(i.classId, i.className);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);
  // Matières narrow to the chosen class so the two filters stay coherent.
  const subjects = useMemo(
    () => [...new Set(items.filter((i) => !klass || i.classId === klass).map((i) => i.subject))].filter(Boolean).sort(),
    [items, klass]
  );

  const filtered = items.filter((f) => {
    if (klass && f.classId !== klass) return false;
    if (subject && f.subject !== subject) return false;
    if (status === "open") return isOpen(f);
    if (status === "resolved") return f.resolved;
    return true;
  });

  // Group filtered feedback by lesson — the whole point is to read each lesson's
  // signal in one place. Hardest lessons (most to-treat, lowest average) first.
  const groups = useMemo(() => {
    const m = new Map();
    for (const f of filtered) {
      const key = f.lessonId || f.lessonTitle;
      if (!m.has(key)) m.set(key, { key, lessonTitle: f.lessonTitle, subject: f.subject, items: [] });
      m.get(key).items.push(f);
    }
    const arr = [...m.values()].map((g) => {
      const avg = Math.round(g.items.reduce((s, x) => s + x.understanding, 0) / g.items.length);
      const open = g.items.filter(isOpen).length;
      g.items.sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || a.understanding - b.understanding);
      return { ...g, avg, open };
    });
    arr.sort((a, b) => b.open - a.open || a.avg - b.avg);
    return arr;
  }, [filtered]);

  // Show the class on each row only when several classes are in view — otherwise
  // it's redundant (the filter already pins one class).
  const showClass = !klass && classList.length > 1;

  // Summary reflects the class + matière scope (but ignores the status tab —
  // these counts are always about what still needs attention).
  const openItems = items.filter(
    (f) => isOpen(f) && (!klass || f.classId === klass) && (!subject || f.subject === subject)
  );
  const totalOpen = openItems.length;
  const studentsFlagged = new Set(openItems.map((i) => i.studentId)).size;
  const lessonsFlagged = new Set(openItems.map((i) => i.lessonId || i.lessonTitle)).size;

  const SUMMARY = [
    { ic: "message", tone: "warn", val: totalOpen, label: "retours à traiter" },
    { ic: "users", tone: "indigo", val: studentsFlagged, label: "élèves concernés" },
    { ic: "book", tone: "slate", val: lessonsFlagged, label: "leçons signalées" },
  ];

  return (
    <TeacherShell active="/teacher/feedback/" crumbGroup="Enseignement" crumbPage="Retours">
      <div className="fb-top">
        <div>
          <h1>Retours des élèves</h1>
          <p className="muted" style={{ marginTop: "5px" }}>
            Ce que vos élèves ont compris — ou pas — leçon par leçon. Marquez un retour comme traité une fois revu en classe.
          </p>
        </div>
        <div className="fb-filters">
          {classList.length > 1 && (
            <div className="fb-select">
              <Icon name="users" />
              <select
                value={klass}
                onChange={(e) => { setKlass(e.target.value); setSubject(""); }}
                aria-label="Filtrer par classe"
              >
                <option value="">Toutes les classes</option>
                {classList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          {subjects.length > 1 && (
            <div className="fb-select">
              <Icon name="filter" />
              <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Filtrer par matière">
                <option value="">Toutes les matières</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          <div className="fb-seg" role="tablist" aria-label="Filtrer par statut">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={status === t.key}
                className={status === t.key ? "active" : ""}
                onClick={() => setStatus(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="fb-summary">
        {SUMMARY.map((k) => (
          <div className={`card fb-kpi tone-${k.tone}`} key={k.label}>
            <span className="fbk-ic"><Icon name={k.ic} /></span>
            <div>
              <div className="fbk-val">{k.val}</div>
              <div className="fbk-lbl">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="fb-empty">Chargement des retours…</div>
      ) : groups.length === 0 ? (
        <div className="fb-empty">
          <span className="fb-empty-ic"><Icon name="check" /></span>
          {status === "open"
            ? "Aucun retour à traiter — tout est à jour. 🎉"
            : "Aucun retour ne correspond à ce filtre."}
        </div>
      ) : (
        <div className="fbg-list">
          {groups.map((g) => (
            <section className="card fbg-card" key={g.key}>
              <header className="fbg-head">
                <div className="fbg-title">
                  <h3>{g.lessonTitle}</h3>
                  <span className="fbg-subj">{g.subject}</span>
                </div>
                <div className="fbg-aside">
                  {g.open > 0 && <span className="fbg-openbadge">{g.open} à traiter</span>}
                  <div className="fbg-meter" title={`Compréhension moyenne : ${g.avg}%`}>
                    <div className="fbm-track">
                      <div className={`fbm-fill ${uLevel(g.avg)}`} style={{ width: `${g.avg}%` }} />
                    </div>
                    <span className="fbm-val">{g.avg}%</span>
                  </div>
                </div>
              </header>
              <div className="fbg-body">
                {g.items.map((f) => (
                  <div className={`fb-row${f.resolved ? " done" : ""}`} key={f.id}>
                    <Avatar name={f.studentName} size="avatar-sm" style={f.avatarColor ? { background: f.avatarColor } : undefined} />
                    <div className="info">
                      <div className="n">
                        {f.studentName}
                        <span className={`fb-pct ${uLevel(f.understanding)}`}>{f.understanding}% · {U_LABEL[f.understanding] ?? ""}</span>
                        {showClass && <span className="fb-class">{f.className}</span>}
                      </div>
                      {f.message ? (
                        <div className="fb-msg">« {f.message} »</div>
                      ) : (
                        <div className="fb-nomsg">Pas de message — a seulement noté sa compréhension.</div>
                      )}
                    </div>
                    {!f.resolved && f.understanding < 100 ? (
                      <button
                        className="fb-resolve"
                        onClick={() => resolve(f.id)}
                        disabled={busy.has(f.id)}
                        title="Marquer comme traité"
                      >
                        <Icon name="check" />
                      </button>
                    ) : f.resolved ? (
                      <span className="fb-done-tag" title="Traité"><Icon name="check" /></span>
                    ) : (
                      <span className="fb-ok-tag" title="A compris"><Icon name="check" /></span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </TeacherShell>
  );
}
