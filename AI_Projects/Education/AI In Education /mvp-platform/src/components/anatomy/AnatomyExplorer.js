"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ClipboardCheck,
  Home,
  Layers,
  Layers3,
  Maximize2,
  Minimize2,
  RotateCcw,
  ScanLine,
  Search,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { OfflinePill } from "@/components/ui/chrome";
import { useFullscreen } from "@/lib/fullscreen";
import { organs, organById, fold, ofOrgan } from "@/lib/anatomyOrgans";
import { SYSTEM_ORDER, systemSheets } from "@/lib/anatomySystems";
import { SpecimenThumb, PlateViewer } from "./SpecimenArt";
import CalqueOverlay from "./CalqueOverlay";
import AnatomyCopilot from "./AnatomyCopilot";
import "@/styles/anatomy.css";

// three.js plus the GLTF stack is ~700 kB. It has no business in the bundle of a
// student who never opens this page, and it cannot server-render.
const AnatomyScene = dynamic(() => import("./AnatomyScene"), {
  ssr: false,
  loading: () => (
    <div className="an-boot">
      <span className="an-spin" />
      <p>Préparation du visualiseur…</p>
    </div>
  ),
});

const VIEWS = [
  { id: "face", label: "Face" },
  { id: "profil", label: "Profil" },
  { id: "dos", label: "Dos" },
];

function shuffle(arr, seed) {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Specimens grouped under the system sheets, in the source app's teaching order. */
function groupBySystem(list) {
  const bucket = new Map();
  for (const o of list) {
    if (!bucket.has(o.system)) bucket.set(o.system, []);
    bucket.get(o.system).push(o);
  }
  const ordered = SYSTEM_ORDER.filter((s) => bucket.has(s)).map((s) => [s, bucket.get(s)]);
  for (const [s, v] of bucket) if (!SYSTEM_ORDER.includes(s)) ordered.push([s, v]);
  return ordered;
}

export default function AnatomyExplorer({ user }) {
  const isStaff = user.role !== "STUDENT";
  const [organId, setOrganId] = useState("heart");
  const [hotspotId, setHotspotId] = useState(null);
  const [query, setQuery] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const [showSystem, setShowSystem] = useState(false);

  // Viewer tools
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [crossSection, setCrossSection] = useState(false);

  // Exercises. "explorer" | "calque" | "revision" — mutually exclusive, because
  // each one wants the markers to say something different.
  const [mode, setMode] = useState("explorer");
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);
  const [quiz, setQuiz] = useState(null);
  const [score, setScore] = useState({ ok: 0, total: 0 });

  const [webgl, setWebgl] = useState(null);
  const sceneRef = useRef(null);
  const shellRef = useRef(null);
  const infoRef = useRef(null);
  const { isFull, toggle: toggleFull } = useFullscreen(shellRef);

  useEffect(() => {
    import("./AnatomyScene").then((m) => setWebgl(m.webglAvailable()));
  }, []);

  const organ = organById[organId];
  const hotspot = organ && hotspotId ? organ.hotspots.find((h) => h.id === hotspotId) ?? null : null;
  const sheet = organ ? systemSheets[organ.system] : null;

  const groups = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return groupBySystem(organs);
    return groupBySystem(
      organs.filter(
        (o) =>
          fold(o.name).includes(q) ||
          fold(o.scientificName).includes(q) ||
          fold(o.system).includes(q) ||
          o.hotspots.some((h) => fold(h.label).includes(q)),
      ),
    );
  }, [query]);

  const resetExercise = useCallback(() => {
    setAnswers({});
    setChecked(false);
    setQuiz(null);
    setScore({ ok: 0, total: 0 });
  }, []);

  const pick = useCallback(
    (id) => {
      setOrganId(id);
      setHotspotId(null);
      setRailOpen(false);
      setShowSystem(false);
      setCrossSection(false);
      resetExercise();
      infoRef.current?.scrollTo({ top: 0 });
    },
    [resetExercise],
  );

  const pickHotspot = useCallback((id) => {
    setHotspotId(id);
    setShowSystem(false);
  }, []);

  // Flying to a structure is a camera move, so it lives with the selection:
  // picking from the list and picking on the model land in the same place.
  useEffect(() => {
    if (!hotspotId || mode !== "explorer") return;
    const hs = organ?.hotspots.find((h) => h.id === hotspotId);
    if (hs) sceneRef.current?.focusHotspot(hs);
  }, [hotspotId, organ, mode]);

  // ---- révision ----
  const nextQuestion = useCallback((forOrgan) => {
    const own = forOrgan?.hotspots ?? [];
    if (!own.length) return;
    const seed = Math.floor(Math.random() * 1e9);
    const target = shuffle(own, seed)[0];
    const sameSystem = organs
      .filter((o) => o.system === forOrgan.system && o.id !== forOrgan.id)
      .flatMap((o) => o.hotspots);
    const seen = new Set([target.label]);
    const distractors = [];
    for (const h of shuffle([...own.filter((h) => h.id !== target.id), ...sameSystem], seed + 7)) {
      if (seen.has(h.label)) continue;
      seen.add(h.label);
      distractors.push(h);
      if (distractors.length === 3) break;
    }
    setQuiz({ target, options: shuffle([target, ...distractors], seed + 13), answer: null });
    sceneRef.current?.focusHotspot(target);
  }, []);

  function enter(next) {
    resetExercise();
    setHotspotId(null);
    setMode(next);
    if (next === "revision") nextQuestion(organ);
  }

  function answerQuiz(id) {
    if (!quiz || quiz.answer) return;
    setQuiz({ ...quiz, answer: id });
    setScore((s) => ({ ok: s.ok + (id === quiz.target.id ? 1 : 0), total: s.total + 1 }));
  }

  // Switching specimen mid-exercise restarts it on the new one.
  useEffect(() => {
    if (mode === "revision" && organ) nextQuestion(organ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organId]);

  const marks = useMemo(() => {
    if (mode !== "calque" || !checked || !organ) return null;
    const out = {};
    for (const h of organ.hotspots) if (answers[h.id]) out[h.id] = answers[h.id] === h.label ? "right" : "wrong";
    return out;
  }, [mode, checked, answers, organ]);

  const pinMode = mode === "calque" ? "blank" : mode === "revision" ? "one" : "all";

  return (
    <div className={`an-shell${isFull ? " is-full" : ""}${railOpen ? " rail-open" : ""}`} ref={shellRef}>
      <header className="an-top">
        {/* The icon sits OUTSIDE the label. It used to be inside it, and the
            phone rule hides the label — which hid the icon with it and left the
            atlas with no way back to the dashboard at all on a small screen. */}
        <Link
          href={isStaff ? "/teacher/" : "/student/"}
          className="an-back"
          aria-label="Revenir au tableau de bord"
          title="Revenir au tableau de bord"
        >
          <Home size={16} />
          <span className="an-back-txt">Tableau de bord</span>
        </Link>
        <div className="an-title">
          <h1>Atlas d'anatomie</h1>
          <p>
            {organs.length} spécimens 3D · {organs.reduce((n, o) => n + o.hotspots.length, 0)} structures repérées ·
            entièrement hors ligne
          </p>
        </div>
        <div className="an-top-right">
          <OfflinePill />
          <button className="an-rail-btn" onClick={() => setRailOpen((v) => !v)} aria-label="Spécimens">
            <Layers size={16} />
          </button>
        </div>
      </header>

      <div className="an-body">
        {/* ---------- library ---------- */}
        <aside className="an-library">
          <div className="an-panel-head">
            <span>Spécimens</span>
          </div>
          <div className="an-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un organe, une structure…"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Effacer">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="an-lib">
            {groups.map(([system, list]) => (
              <section key={system} className="an-group">
                <h2>{system}</h2>
                <ul>
                  {list.map((o) => (
                    <li key={o.id}>
                      <button
                        className={`an-item${organId === o.id ? " is-sel" : ""}`}
                        onClick={() => pick(o.id)}
                        style={{ "--accent": o.accent }}
                      >
                        <SpecimenThumb organ={o} />
                        <span className="an-item-txt">
                          <b>{o.name}</b>
                          <small>{o.scientificName}</small>
                        </span>
                        <span className="an-item-n">{o.hotspots.length}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!groups.length && <p className="an-empty">Aucun spécimen ne correspond.</p>}
          </div>
        </aside>

        {/* ---------- specimen ---------- */}
        <main className="an-stage">
          <div className="an-glow" style={{ "--organ-accent": organ?.accent ?? "#eb7c6b" }} />

          {webgl === false ? (
            <div className="an-fallback">
              <h2>La 3D n'est pas disponible sur cet appareil</h2>
              <p>
                Ce navigateur ne prend pas en charge WebGL. La bibliothèque, les planches illustrées, les fiches et le
                Copilote restent utilisables : choisissez un organe à gauche.
              </p>
            </div>
          ) : (
            <>
              <AnatomyScene
                handle={sceneRef}
                organ={organ}
                hotspotId={hotspotId}
                onPickHotspot={pickHotspot}
                pinMode={pinMode}
                soloHotspotId={quiz?.target?.id ?? null}
                marks={marks}
                autoRotate={autoRotate}
                wireframe={wireframe}
                crossSection={crossSection}
              />

              <div className="an-tools">
                <button
                  className={`an-tool${autoRotate ? " is-on" : ""}`}
                  onClick={() => setAutoRotate((v) => !v)}
                  title="Rotation automatique"
                >
                  <RotateCcw size={17} />
                  Rotation
                </button>
                <button
                  className={`an-tool${crossSection ? " is-on" : ""}`}
                  onClick={() => setCrossSection((v) => !v)}
                  title="Coupe transversale"
                >
                  <ScanLine size={17} />
                  Coupe
                </button>
                <button
                  className={`an-tool${wireframe ? " is-on" : ""}`}
                  onClick={() => setWireframe((v) => !v)}
                  title="Calque fil de fer"
                >
                  <Layers3 size={17} />
                  Fil de fer
                </button>
                <button
                  className={`an-tool${mode === "calque" ? " is-on" : ""}`}
                  onClick={() => enter(mode === "calque" ? "explorer" : "calque")}
                  disabled={!organ?.hotspots.length}
                  title="Calque à annoter"
                >
                  <ClipboardCheck size={17} />
                  Calque
                </button>
                <button
                  className={`an-tool${mode === "revision" ? " is-on" : ""}`}
                  onClick={() => enter(mode === "revision" ? "explorer" : "revision")}
                  disabled={!organ?.hotspots.length}
                  title="Mode révision"
                >
                  <Target size={17} />
                  Révision
                </button>
                <button className="an-tool an-tool-sep" onClick={toggleFull} title="Plein écran">
                  {isFull ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                  {isFull ? "Quitter" : "Écran"}
                </button>
              </div>

              <p className="an-hint">
                Faites glisser pour tourner · molette ou pincement pour zoomer
              </p>
              <div className="an-views">
                {VIEWS.map((v) => (
                  <button key={v.id} onClick={() => sceneRef.current?.view(v.id)}>
                    {v.label}
                  </button>
                ))}
                <button onClick={() => sceneRef.current?.reset()} title="Recadrer">
                  <RotateCcw size={13} />
                </button>
              </div>
            </>
          )}
        </main>

        {/* ---------- reading ---------- */}
        <aside className="an-info" ref={infoRef}>
          {mode === "calque" && organ ? (
            <CalqueOverlay
              organ={organ}
              answers={answers}
              checked={checked}
              onAnswer={(id, label) => setAnswers((a) => ({ ...a, [id]: label }))}
              onCheck={() => setChecked(true)}
              onReset={() => {
                setAnswers({});
                setChecked(false);
              }}
              onFocus={(hs) => sceneRef.current?.focusHotspot(hs)}
            />
          ) : mode === "revision" && organ ? (
            <section className="an-quiz">
              <header>
                <h2>
                  <Target size={16} /> Mode révision
                </h2>
                <span className="an-score">
                  {score.ok} / {score.total}
                </span>
              </header>
              <p className="an-quiz-q">Quelle structure {ofOrgan(organ)} porte le repère ?</p>
              <div className="an-quiz-opts">
                {quiz?.options.map((o) => {
                  const done = !!quiz.answer;
                  const right = o.id === quiz.target.id;
                  const chosen = quiz.answer === o.id;
                  return (
                    <button
                      key={o.id + o.label}
                      className={`an-opt${done && right ? " is-right" : ""}${done && chosen && !right ? " is-wrong" : ""}`}
                      onClick={() => answerQuiz(o.id)}
                      disabled={done}
                    >
                      {o.label}
                      {done && right && <Check size={14} />}
                      {done && chosen && !right && <X size={14} />}
                    </button>
                  );
                })}
              </div>
              {quiz?.answer && (
                <div className="an-quiz-after">
                  <p className="an-quiz-role">
                    <strong>{quiz.target.label}</strong> — {quiz.target.detail}
                  </p>
                  <button className="an-btn" onClick={() => nextQuestion(organ)}>
                    Structure suivante
                  </button>
                </div>
              )}
              <button className="an-quiz-quit" onClick={() => enter("explorer")}>
                Revenir à l'exploration
              </button>
            </section>
          ) : showSystem && sheet ? (
            <section className="an-card">
              <button className="an-back-link" onClick={() => setShowSystem(false)}>
                <X size={12} /> Fermer la fiche système
              </button>
              <span className="an-chip" style={{ "--sys": organ.accent }}>
                Système
              </span>
              <h2>{sheet.name}</h2>
              <p className="an-latin">{sheet.tagline}</p>
              <p className="an-role">{sheet.role}</p>
              <h3>Composition</h3>
              <p className="an-para">{sheet.composition}</p>
              <h3>Fonctionnement</h3>
              <p className="an-para">{sheet.physiology}</p>
              <h3>À retenir</h3>
              <ul className="an-retenir">
                {sheet.keyPoints.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
              <h3>Liens avec les autres systèmes</h3>
              <p className="an-para">{sheet.connections}</p>
            </section>
          ) : organ ? (
            <>
              <section className="an-card">
                <div className="an-card-head">
                  <span className="an-chip" style={{ "--sys": organ.accent }}>
                    {organ.system}
                  </span>
                  {sheet && (
                    <button className="an-sheet-link" onClick={() => setShowSystem(true)}>
                      Fiche système <BookOpen size={11} />
                    </button>
                  )}
                </div>
                <h2>{organ.name}</h2>
                <p className="an-latin">
                  {organ.scientificName} · {organ.poetic}
                </p>
                <p className="an-role">{organ.description}</p>

                <dl className="an-facts">
                  <div>
                    <dt>Taille</dt>
                    <dd>{organ.size}</dd>
                  </div>
                  <div>
                    <dt>{organ.weightLabel || "Poids"}</dt>
                    <dd>{organ.weight}</dd>
                  </div>
                  <div>
                    <dt>Localisation</dt>
                    <dd>{organ.location}</dd>
                  </div>
                  <div>
                    <dt>Fonction</dt>
                    <dd>{organ.function}</dd>
                  </div>
                  <div>
                    <dt>Tissu</dt>
                    <dd>{organ.tissue}</dd>
                  </div>
                  <div>
                    <dt>Vascularisation</dt>
                    <dd>{organ.bloodSupply}</dd>
                  </div>
                </dl>

                <p className="an-fun">
                  <Sparkles size={14} /> {organ.funFact}
                </p>
              </section>

              <PlateViewer organ={organ} />

              <section className="an-card">
                <h3>Structures repérées</h3>
                <div className="an-hs-list">
                  {organ.hotspots.map((h) => (
                    <button
                      key={h.id}
                      className={`an-hs${hotspotId === h.id ? " is-sel" : ""}`}
                      style={{ "--pin": h.color }}
                      onClick={() => pickHotspot(h.id)}
                    >
                      <span className="an-hs-dot" />
                      <span>
                        <b>{h.label}</b>
                        <em>{h.detail}</em>
                      </span>
                    </button>
                  ))}
                </div>
                {hotspot?.body && (
                  <div className="an-hs-body">
                    {hotspot.body.split("\n\n").map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                )}
              </section>

              {!!organ.conditions?.length && (
                <section className="an-card">
                  <h3>Pathologies étudiées</h3>
                  <div className="an-cond-chips">
                    {organ.conditions.map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </div>
                </section>
              )}

              <AnatomyCopilot organ={organ} hotspot={hotspot} isStaff={isStaff} />
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
