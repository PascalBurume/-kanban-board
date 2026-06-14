"use client";
import { useEffect, useRef, useState } from "react";
import { answer } from "@/lib/copilot";

const CHIPS = {
  eleve: ["C'est quoi la loi de Coulomb ?", "Explique l'oxydation", "Exercices sur le champ électrique"],
  prof: ["Plan de cours : Électrostatique", "Exercices sur la loi de Coulomb", "Quelles leçons sont vérifiées ?"],
};

export default function Copilot({ role, index, exercises, onOpenLesson }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => { setMsgs([]); }, [role]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  const greeting = role === "prof"
    ? "Bonjour 👋🏾 Je suis votre assistant pédagogique hors-ligne. Je cite directement les manuels : passage d'une leçon, plan de cours à partir du «Plan du module», ou sélection d'exercices reliés à une leçon."
    : "Salut 👋🏾 Je suis ton copilote hors-ligne : je réponds en citant tes leçons, avec le lien pour ouvrir la bonne page. Pose-moi une question de cours !";

  function send(q) {
    const question = (q ?? input).trim();
    if (!question) return;
    setInput("");
    const a = answer({ role, q: question, index, exercises });
    setMsgs((m) => [...m, { who: "user", text: question }, { who: "bot", a }]);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white shadow-lg shadow-teal-900/30 hover:bg-teal-800"
        aria-label="Ouvrir le copilote"
      >
        ✨ Copilote
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex h-[min(580px,84vh)] w-[min(400px,94vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-2 bg-gradient-to-br from-brand to-teal-900 px-4 py-3 text-white">
        <div>
          <div className="text-sm font-bold">{role === "prof" ? "Copilote Professeur" : "Copilote Élève"}</div>
          <div className="text-[11px] opacity-80">Hors-ligne · répond en citant les manuels</div>
        </div>
        <button onClick={() => setOpen(false)} className="ml-auto rounded-lg bg-white/15 px-2 py-1 text-sm" aria-label="Fermer">✕</button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
        <Bubble who="bot"><p className="text-[13.5px]">{greeting}</p></Bubble>
        {msgs.map((m, i) =>
          m.who === "user"
            ? <Bubble key={i} who="user">{m.text}</Bubble>
            : <Bubble key={i} who="bot"><BotAnswer a={m.a} onOpenLesson={onOpenLesson} /></Bubble>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1.5 bg-slate-50 px-3 pb-2">
        {CHIPS[role === "prof" ? "prof" : "eleve"].map((c) => (
          <button key={c} onClick={() => send(c)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-brand hover:border-brand">
            {c}
          </button>
        ))}
      </div>

      <div className="flex gap-2 border-t border-slate-200 bg-white p-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Pose ta question…"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button onClick={() => send()} className="rounded-lg bg-brand px-4 font-bold text-white" aria-label="Envoyer">➤</button>
      </div>
    </div>
  );
}

function Bubble({ who, children }) {
  return who === "user" ? (
    <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-[13.5px] text-white">{children}</div>
  ) : (
    <div className="max-w-[88%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2 text-[13.5px] text-slate-800">{children}</div>
  );
}

function BotAnswer({ a, onOpenLesson }) {
  return (
    <div>
      {a.kind === "plan" ? (
        <div>
          <p className="font-bold">{a.title}</p>
          <p className="text-xs text-slate-500">{a.meta}</p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
            {a.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      ) : (
        <p>{a.text}</p>
      )}
      {a.quote && (
        <blockquote className="mt-1.5 rounded-r-md border-l-2 border-teal-400 bg-teal-50 px-2.5 py-1 text-xs text-slate-600">
          «…{a.quote}…»
        </blockquote>
      )}
      {a.draft && <p className="mt-1 text-[11px] text-amber-700">⚠️ extrait OCR brut — la formulation peut être imparfaite.</p>}
      {(a.sources?.length > 0 || a.openExercises) && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-dashed border-slate-200 pt-1.5">
          {a.sources.map((r) => (
            <button key={r.path}
              onClick={() => onOpenLesson({ path: r.path, title: r.title, n: r.module })}
              className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800 hover:bg-teal-100">
              📖 {r.subject} · L{r.module}
            </button>
          ))}
          {a.openExercises && (
            <button
              onClick={() => onOpenLesson({ path: a.openExercises, tab: "exercices" })}
              className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100">
              ✎ Voir les exercices
            </button>
          )}
        </div>
      )}
    </div>
  );
}
