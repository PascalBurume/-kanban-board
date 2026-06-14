"use client";
import { useEffect, useMemo, useState } from "react";
import Reader from "@/components/Reader";
import Search from "@/components/Search";
import Copilot from "@/components/Copilot";
import ProfDashboard from "@/components/ProfDashboard";
import { loadManifest, loadSearchIndex, loadExercises, STATUS_LABELS } from "@/lib/content";

function Badge({ status }) {
  const b = STATUS_LABELS[status];
  if (!b) return null;
  return <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${b.c}`}>{b.t}</span>;
}

function Card({ title, subtitle, extra, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand hover:shadow-md"
    >
      <span className={`mb-2 h-1.5 w-10 rounded-full ${accent || "bg-brand-light"}`} />
      <span className="font-semibold text-slate-900 group-hover:text-brand">{title}</span>
      {subtitle && <span className="mt-1 text-xs text-slate-500">{subtitle}</span>}
      {extra && <span className="mt-1 text-xs font-semibold text-teal-700">{extra}</span>}
    </button>
  );
}

export default function Home() {
  const [manifest, setManifest] = useState(null);
  const [index, setIndex] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [err, setErr] = useState(null);
  const [role, setRole] = useState("eleve"); // "eleve" | "prof"
  const [sel, setSel] = useState({ c: null, f: null, s: null });
  const [module, setModule] = useState(null);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    loadManifest().then(setManifest).catch((e) => setErr(e.message));
    loadSearchIndex().then(setIndex).catch(() => {});
    loadExercises().then(setExercises).catch(() => {});
  }, []);

  const exByPath = useMemo(() => {
    const m = {};
    for (const e of exercises) (m[e.lessonPath] ||= []).push(e);
    return m;
  }, [exercises]);

  if (err) return <Centered>⚠️ {err}<br /><span className="text-sm text-slate-500">Servez l&apos;app via un serveur (npm run serve) — le protocole file:// ne permet pas de charger le contenu.</span></Centered>;
  if (!manifest) return <Centered>Chargement…</Centered>;

  const cls = manifest.classes.find((c) => c.id === sel.c) || null;
  const fld = cls?.fields.find((f) => f.id === sel.f) || null;
  const subj = fld?.subjects.find((s) => s.id === sel.s) || null;

  const reset = (lvl) => {
    if (lvl === "home") setSel({ c: null, f: null, s: null });
    else if (lvl === "class") setSel((p) => ({ ...p, f: null, s: null }));
    else if (lvl === "field") setSel((p) => ({ ...p, s: null }));
    setModule(null);
  };

  // Open any lesson by path (used by Search, Copilot, exercise bank).
  const openLesson = (m) => {
    outer: for (const c of manifest.classes)
      for (const f of c.fields)
        for (const s of f.subjects)
          if (s.modules.some((x) => x.path === m.path)) {
            setSel({ c: c.id, f: f.id, s: s.id });
            break outer;
          }
    const rec = index.find((r) => r.path === m.path);
    setModule({ path: m.path, title: m.title || rec?.title, n: m.n ?? rec?.module, tab: m.tab });
    setShowSearch(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button onClick={() => { setRole("eleve"); reset("home"); }} className="flex items-center gap-2 font-bold text-brand">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white text-sm">M</span>
            Mwalimu
          </button>
          <span className="hidden text-sm text-slate-400 sm:inline">Manuels 5e &amp; 6e · RDC</span>
          <div className="ml-auto flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
            <RoleBtn on={role === "eleve"} onClick={() => { setRole("eleve"); setModule(null); }}>🎓 Élève</RoleBtn>
            <RoleBtn on={role === "prof"} onClick={() => { setRole("prof"); setModule(null); }}>👩🏾‍🏫 Professeur</RoleBtn>
          </div>
          <button
            onClick={() => setShowSearch(true)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:border-brand hover:text-brand"
          >
            🔎 <span className="hidden sm:inline">Rechercher</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {role === "prof" && !module ? (
          <ProfDashboard index={index} exercises={exercises} onOpenLesson={openLesson} />
        ) : (
          <>
            <nav className="mb-5 flex flex-wrap items-center gap-1 text-sm text-slate-500">
              <Crumb onClick={() => reset("home")} active={!cls}>Accueil</Crumb>
              {cls && <><Sep /><Crumb onClick={() => reset("class")} active={!fld}>{cls.label}</Crumb></>}
              {fld && <><Sep /><Crumb onClick={() => reset("field")} active={!subj}>{fld.label}</Crumb></>}
              {subj && <><Sep /><Crumb active>{subj.label}</Crumb></>}
            </nav>

            {module ? (
              <Reader
                module={module}
                exercises={exByPath[module.path] || []}
                onBack={() => setModule(null)}
              />
            ) : !cls ? (
              <Section title="Choisis ta classe">
                <Grid>
                  {manifest.classes.map((c) => (
                    <Card key={c.id} title={c.label}
                      subtitle={`${c.fields.length} filière(s)`}
                      onClick={() => setSel({ c: c.id, f: null, s: null })} />
                  ))}
                </Grid>
              </Section>
            ) : !fld ? (
              <Section title={`${cls.label} — choisis ta filière`}>
                <Grid>
                  {cls.fields.map((f) => (
                    <Card key={f.id} title={f.label}
                      subtitle={`${f.subjects.length} matière(s)`}
                      accent="bg-amber-300"
                      onClick={() => setSel((p) => ({ ...p, f: f.id, s: null }))} />
                  ))}
                </Grid>
              </Section>
            ) : !subj ? (
              <Section title={`${fld.label} — matières`}>
                <Grid>
                  {fld.subjects.map((s) => {
                    const nEx = s.modules.reduce((n, m) => n + (exByPath[m.path]?.length || 0), 0);
                    return (
                      <Card key={s.id} title={s.label}
                        subtitle={`${s.book_title}`}
                        extra={nEx ? `✎ ${nEx} exercices` : null}
                        accent="bg-sky-300"
                        onClick={() => setSel((p) => ({ ...p, s: s.id }))} />
                    );
                  })}
                </Grid>
              </Section>
            ) : (
              <Section title={`${subj.label} — leçons`} subtitle={subj.book_title}>
                <ol className="space-y-2">
                  {subj.modules.map((m) => {
                    const nEx = exByPath[m.path]?.length || 0;
                    return (
                      <li key={m.path}>
                        <button
                          onClick={() => setModule({ path: m.path, title: m.title, n: m.n })}
                          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-brand hover:bg-teal-50/40"
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{m.n}</span>
                          <span className="font-medium text-slate-800">{m.title}</span>
                          {nEx > 0 && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800">✎ {nEx}</span>}
                          <Badge status={m.status} />
                          <span className="ml-auto text-slate-300">›</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </Section>
            )}
          </>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-xs text-slate-400">
        Mwalimu MVP · Contenu numérisé de manuels du secondaire (RDC) · {index.length} leçons · {exercises.length} exercices
      </footer>

      {showSearch && (
        <Search
          index={index}
          onClose={() => setShowSearch(false)}
          onPick={(r) => openLesson({ path: r.path, title: r.title, n: r.module })}
        />
      )}

      <Copilot role={role} index={index} exercises={exercises} onOpenLesson={openLesson} />
    </div>
  );
}

function RoleBtn({ on, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-brand text-white" : "text-slate-500 hover:text-brand"}`}>
      {children}
    </button>
  );
}
function Section({ title, subtitle, children }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mb-3 text-sm text-slate-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
const Grid = ({ children }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
);
const Sep = () => <span className="text-slate-300">/</span>;
function Crumb({ children, onClick, active }) {
  return (
    <button onClick={onClick} disabled={active}
      className={active ? "font-medium text-slate-700" : "hover:text-brand"}>
      {children}
    </button>
  );
}
function Centered({ children }) {
  return <div className="grid min-h-screen place-items-center p-6 text-center text-slate-600">{children}</div>;
}
