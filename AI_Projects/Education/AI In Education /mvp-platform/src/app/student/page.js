"use client";
import "./dashboard.css";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import Ring from "@/components/ui/Ring";
import BarChart from "@/components/ui/BarChart";
import { BrandMark, OfflinePill, LangToggle, Avatar } from "@/components/ui/chrome";
import { toast } from "@/lib/toast";

function fmtWeek(min) {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h && rem) return `${h}h ${rem}m`;
  if (h) return `${h}h`;
  return `${rem}m`;
}

// One chapter (module) card — progress ring + status. Modules are accessible by
// default and link to /module/[id]; a teacher-locked module renders disabled.
function ChapterCard({ c, accent }) {
  const locked = c.status === "locked";
  const statusIc = c.status === "done" ? "check" : locked ? "lock" : "play";
  const ringColor = locked ? "var(--slate-300)" : accent || "#4f46e5";
  const inner = (
    <>
      <Ring pct={c.pct} size={56} stroke={6} color={ringColor} />
      <div className="cc-body">
        <div className="cc-top">
          <span className="cc-code">M{c.order}</span>
          <span className={`cc-dot ${c.status}`}><Icon name={statusIc} /></span>
        </div>
        <h3>{c.title}</h3>
        <div className="cc-foot">
          <span className="cc-pill">{locked ? "Verrouillé" : `${c.pct}% terminé`}</span>
          <span className="cc-lessons">{c.lessonCount} leçons</span>
        </div>
      </div>
    </>
  );
  if (locked) {
    return (
      <div
        className={`chap-card chap-locked`}
        style={{ "--accent": accent || "#4f46e5" }}
        onClick={() => toast("Ce module a été verrouillé par votre enseignant.", { icon: "lock" })}
        role="button"
        tabIndex={0}
      >
        {inner}
      </div>
    );
  }
  return (
    <a className={`chap-card chap-${c.status}`} href={`/module/${c.moduleId}/`} style={{ "--accent": accent || "#4f46e5" }}>
      {inner}
    </a>
  );
}

// Per-subject roll-up for the course header card.
function subjectSummary(s) {
  const totalMods = s.chapters.length;
  const doneMods = s.chapters.filter((c) => c.status === "done").length;
  const lockedMods = s.chapters.filter((c) => c.status === "locked").length;
  const totalLessons = s.chapters.reduce((a, c) => a + c.lessonCount, 0);
  const doneLessons = s.chapters.reduce((a, c) => a + c.doneCount, 0);
  const pct = totalLessons ? Math.round((doneLessons / totalLessons) * 100) : 0;
  return { totalMods, doneMods, lockedMods, pct };
}

export default function StudentDashboard() {
  const [copilot, setCopilot] = useState(true);
  const [data, setData] = useState(null);
  const [chapters, setChapters] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openSubjects, setOpenSubjects] = useState(() => new Set()); // slugs of expanded courses (independent)
  const initOpen = useRef(false);

  const toggleSubject = (slug) =>
    setOpenSubjects((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });

  useEffect(() => {
    Promise.all([
      fetch("/api/student/path/").then(async (r) => {
        if (r.status === 403) { window.location.href = "/login/"; return null; }
        return r.json();
      }),
      fetch("/api/student/chapters/").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([d, ch]) => { if (d) setData(d); if (ch) setChapters(ch); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const fabClick = () => {
    if (copilot) toast("Ouvre une leçon pour discuter avec le Copilot.", { icon: "sparkles", color: "#a5b4fc" });
  };

  const stats = data?.stats;
  const cont = data?.continue || null;
  const subjects = data?.subjects || [];
  const overallPct = cont ? (stats?.overallPct ?? 0) : (data ? 100 : 0);

  const lastSubject = subjects[subjects.length - 1];
  const lastLesson = lastSubject?.lessons?.[lastSubject.lessons.length - 1] || null;
  const heroLessonId = cont ? cont.lessonId : lastLesson?.id || null;
  const earnedCount = stats?.badges?.filter((b) => b.earned).length ?? 0;
  const chapSubjects = chapters?.subjects || [];

  // Streak label + greeting that actually reflect the real value (0 / 1 / many),
  // with correct French pluralisation ("1 jour", "3 jours").
  const streakDays = stats?.streak ?? 0;
  const streakLabel = streakDays > 0 ? `série de ${streakDays} jour${streakDays > 1 ? "s" : ""}` : "Pas encore de série";
  const greetSub =
    streakDays > 0
      ? "Tu es sur ta lancée — garde ta série en vie aujourd’hui."
      : "Commence ta série aujourd’hui : termine une leçon pour la lancer.";

  // On first load, expand the course holding the "continue" lesson (else the
  // first). After that the user controls each course independently.
  useEffect(() => {
    if (initOpen.current || chapSubjects.length === 0) return;
    initOpen.current = true;
    const active = cont && chapSubjects.find((s) => s.name === cont.subjectName);
    setOpenSubjects(new Set([(active || chapSubjects[0]).slug]));
  }, [chapters, cont]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dash-page">
      <header className="app-header">
        <a className="brand" href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <BrandMark /> Mwalimu
        </a>
        <div className="row" style={{ gap: 14 }}>
          <a className="practice-nav" href="/practice/">
            <Icon name="sparkles" /> S’entraîner
          </a>
          <OfflinePill label="Serveur local connecté" />
          <LangToggle
            onNotice={() =>
              toast("Le français complet arrive — interface en anglais pour cette revue.", { icon: "info" })
            }
          />
          <a className="user-chip" href="/profile/" style={{ textDecoration: "none", color: "inherit" }}>
            <Avatar name={data ? `${data.student.firstName} ${data.student.lastName}` : ""} size="avatar-sm" />
            <div className="col" style={{ gap: 0 }}>
              <span className="nm">{data ? `${data.student.firstName} ${data.student.lastName}` : " "}</span>
              <span className="cl">{data?.className || " "}</span>
            </div>
          </a>
        </div>
      </header>

      {loading ? (
        <main className="wrap-main"><div className="greet"><div><h1>Chargement…</h1><p>Récupération de ton parcours d’apprentissage…</p></div></div></main>
      ) : error || !data ? (
        <main className="wrap-main"><div className="greet"><div><h1>Une erreur s’est produite</h1><p>Nous n’avons pas pu charger ton tableau de bord. Actualise la page pour réessayer.</p></div></div></main>
      ) : (
        <main className="wrap-main">
          <div className="greet">
            <div>
              <h1>Salut, {data.student.firstName} 👋</h1>
              <p>{greetSub}</p>
            </div>
            <div className="stats">
              <span className="stat-pill"><span className="ic flame"><Icon name="flame" /></span> {streakLabel}</span>
              <span className="stat-pill"><span className="ic xpx"><Icon name="xp" /></span> {stats.xp.toLocaleString("fr-FR")} XP</span>
              <span className="stat-pill"><span className="ic" style={{ color: "var(--indigo-500)" }}><Icon name="trophy" /></span> Niveau {stats.level}</span>
            </div>
          </div>

          <div className="grid-2">
            <div className="main-col">
              {/* Hero */}
              <div
                className="hero"
                onClick={() => { if (heroLessonId) window.location.href = "/lesson/?id=" + heroLessonId; }}
                style={{ cursor: heroLessonId ? "pointer" : "default" }}
              >
                <Ring pct={overallPct} size={92} stroke={8} color="#fff" track="rgba(255,255,255,.25)" />
                <div className="hero-body">
                  <div className="eyebrow"><span><Icon name="play" /></span> {cont ? "Continuer l’apprentissage" : "Tout est terminé 🎉"}</div>
                  <h2>{cont ? cont.title : "Tout est terminé 🎉"}</h2>
                  <div className="meta">
                    {cont ? (
                      <>
                        <span><span><Icon name={cont.icon || "book"} /></span> {cont.subjectName}</span>
                        {cont.hasQuiz && <span><span><Icon name="target" /></span> Quiz inclus</span>}
                      </>
                    ) : (
                      <span><span><Icon name="trophy" /></span> Toutes les leçons sont terminées</span>
                    )}
                  </div>
                </div>
                {heroLessonId && (
                  <a className="btn btn-light btn-lg" href={"/lesson/?id=" + heroLessonId} onClick={(e) => e.stopPropagation()}>
                    {cont ? "Reprendre" : "Revoir"} <span><Icon name="arrowR" /></span>
                  </a>
                )}
              </div>

              {/* Modules grid */}
              <div className="sec-head">
                <h2><span style={{ color: "var(--primary)" }}><Icon name="layers" /></span> Tes modules</h2>
                <span className="sec-hint">Tous les modules sont accessibles — apprends à ton rythme.</span>
              </div>

              {chapSubjects.length === 0 ? (
                <p className="muted" style={{ padding: "20px 4px" }}>Aucun module disponible pour le moment.</p>
              ) : (
                chapSubjects.map((s) => {
                  const sum = subjectSummary(s);
                  const open = openSubjects.has(s.slug);
                  const accent = s.color || "#4f46e5";
                  return (
                    <section className={`mod-subject ${open ? "open" : ""}`.trim()} key={s.slug}>
                      <button
                        className="mod-subj-head"
                        aria-expanded={open}
                        onClick={() => toggleSubject(s.slug)}
                        style={{ "--accent": accent }}
                      >
                        <span className="mod-subj-ic" style={{ background: accent + "22", color: accent }}>
                          <Icon name={s.icon || "book"} />
                        </span>
                        <div className="mod-subj-meta">
                          <h3>{s.name}</h3>
                          <span className="mod-subj-count">
                            {sum.doneMods}/{sum.totalMods} modules terminés
                            {sum.lockedMods > 0 ? ` · ${sum.lockedMods} verrouillé${sum.lockedMods > 1 ? "s" : ""}` : ""}
                          </span>
                        </div>
                        <div className="mod-subj-prog">
                          <div className="mod-subj-bar"><span style={{ width: `${sum.pct}%`, background: accent }} /></div>
                          <span className="mod-subj-pct">{sum.pct}%</span>
                        </div>
                        <span className="mod-subj-chev"><Icon name={open ? "chevD" : "chevR"} /></span>
                      </button>
                      {open && (
                        <div className="mod-grid">
                          {s.chapters.map((c) => <ChapterCard key={c.moduleId} c={c} accent={s.color} />)}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </div>

            {/* Sidebar */}
            <aside>
              <div className="card side-card">
                <h3>
                  <span className="ttl"><span><Icon name="clock" /></span> Temps cette semaine</span>
                  <span className="week-total">{fmtWeek(stats.weekMinutes)}</span>
                </h3>
                {stats.weekMinutes > 0 ? (
                  <BarChart
                    data={stats.weekDays.map((d) => ({ label: d.label, value: d.minutes, highlight: d.isToday }))}
                    formatValue={fmtWeek}
                    height={110}
                    ariaLabel="Temps d’étude par jour cette semaine"
                  />
                ) : (
                  <p className="week-empty">Commence une leçon pour suivre ton temps d’étude.</p>
                )}
              </div>

              <div className="card side-card">
                <h3>
                  <span className="ttl"><span><Icon name="trophy" /></span> Badges</span>
                  <span className="badge badge-primary">{earnedCount} obtenus</span>
                </h3>
                <div className="badges">
                  {stats.badges.map((b) => (
                    <div className={`badge-cell ${b.earned ? "" : "locked"}`.trim()} key={b.slug} title={b.earned ? `${b.name} — obtenu ✓` : `${b.name} — ${b.hint}`}>
                      <div className="badge-ic" style={b.earned ? { background: "var(--indigo-100)", color: "var(--indigo-600)" } : undefined}>
                        <Icon name={b.icon || "trophy"} />
                      </div>
                      <span className="bl">{b.name}</span>
                      {!b.earned && b.sub && <span className="bsub">{b.sub}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {data.nextQuiz && (
                <div className="card side-card next-quiz">
                  <div className="nq-top">
                    <div className="nq-ic"><Icon name="target" /></div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, fontFamily: "var(--font-head)" }}>Prochain quiz</div>
                      <div className="tiny muted">{data.nextQuiz.title}</div>
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-block btn-sm" onClick={() => { window.location.href = "/lesson/?id=" + data.nextQuiz.lessonId; }}>
                    Aperçu du quiz
                  </button>
                </div>
              )}
            </aside>
          </div>
        </main>
      )}

      {/* Copilot FAB */}
      <div className={`fab ${copilot ? "" : "disabled"}`.trim()}>
        <span className="fab-label">{copilot ? "Demander au Copilot" : "Copilot en pause"}</span>
        <div className="fab-tip">Ton enseignant a mis le Copilot en pause pour le moment.</div>
        <button className="fab-btn" disabled={!copilot} onClick={fabClick}>
          <span><Icon name="sparkles" /></span>
        </button>
      </div>
    </div>
  );
}
