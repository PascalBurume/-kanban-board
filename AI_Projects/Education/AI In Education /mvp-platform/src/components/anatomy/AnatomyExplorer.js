"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { BrandMark, OfflinePill } from "@/components/ui/chrome";
import { useFullscreen } from "@/lib/fullscreen";
import { organs, organById, fold, withArticle, ofOrgan } from "@/lib/anatomyOrgans";
import { SYSTEM_ORDER, systemSheets } from "@/lib/anatomySystems";
import AnatomyCopilot from "./AnatomyCopilot";
import "@/styles/anatomy.css";

// three.js plus the GLTF stack is ~700 kB. It has no business in the bundle of a
// student who never opens this page, and it cannot server-render.
const AnatomyScene = dynamic(() => import("./AnatomyScene"), {
  ssr: false,
  loading: () => (
    <div className="an-viewport an-boot">
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

/** Organs in teaching order, grouped under the system sheets they belong to. */
function groupBySystem(list) {
  const bucket = new Map();
  for (const o of list) {
    if (!bucket.has(o.system)) bucket.set(o.system, []);
    bucket.get(o.system).push(o);
  }
  const ordered = SYSTEM_ORDER.filter((s) => bucket.has(s)).map((s) => [s, bucket.get(s)]);
  // Any system the order list doesn't know about still gets shown, at the end.
  for (const [s, v] of bucket) if (!SYSTEM_ORDER.includes(s)) ordered.push([s, v]);
  return ordered;
}

export default function AnatomyExplorer({ user }) {
  const isStaff = user.role !== "STUDENT";
  const [organId, setOrganId] = useState("heart");
  const [hotspotId, setHotspotId] = useState(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("explorer");
  const [quiz, setQuiz] = useState(null);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const [webgl, setWebgl] = useState(null);
  const [railOpen, setRailOpen] = useState(false);
  const [showSystem, setShowSystem] = useState(false);

  const sceneRef = useRef(null);
  const shellRef = useRef(null);
  const detailRef = useRef(null);
  const { isFull, toggle: toggleFull } = useFullscreen(shellRef);

  useEffect(() => {
    import("./AnatomyScene").then((m) => setWebgl(m.webglAvailable()));
  }, []);

  const organ = organById[organId];
  const hotspot = hotspot_of(organ, hotspotId);
  const sheet = organ ? systemSheets[organ.system] : null;

  const groups = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return groupBySystem(organs);
    const hits = organs.filter(
      (o) =>
        fold(o.name).includes(q) ||
        fold(o.scientificName).includes(q) ||
        fold(o.system).includes(q) ||
        o.hotspots.some((h) => fold(h.label).includes(q)),
    );
    return groupBySystem(hits);
  }, [query]);

  const pick = useCallback((id) => {
    setOrganId(id);
    setHotspotId(null);
    setRailOpen(false);
    setShowSystem(false);
    detailRef.current?.scrollTo({ top: 0 });
  }, []);

  const pickHotspot = useCallback((id) => {
    setHotspotId(id);
    setShowSystem(false);
  }, []);

  // Flying to a hotspot is a camera move, so it belongs with the selection
  // rather than inside the scene: picking from the rail and picking from the
  // model should land in exactly the same place.
  useEffect(() => {
    if (!hotspotId || mode === "revision") return;
    const hs = organ?.hotspots.find((h) => h.id === hotspotId);
    if (hs) sceneRef.current?.focusHotspot(hs);
  }, [hotspotId, organ, mode]);

  // ---- révision ----
  const nextQuestion = useCallback(
    (forOrgan) => {
      const own = forOrgan?.hotspots ?? [];
      if (!own.length) return;
      const seed = Math.floor(Math.random() * 1e9);
      const target = shuffle(own, seed)[0];
      // Distractors come from the same organ first; a short specimen borrows
      // from its own system, so the choices stay plausible.
      const sameSystem = organs
        .filter((o) => o.system === forOrgan.system && o.id !== forOrgan.id)
        .flatMap((o) => o.hotspots);
      const pool = [...own.filter((h) => h.id !== target.id), ...sameSystem];
      const seen = new Set([target.label]);
      const distractors = [];
      for (const h of shuffle(pool, seed + 7)) {
        if (seen.has(h.label)) continue;
        seen.add(h.label);
        distractors.push(h);
        if (distractors.length === 3) break;
      }
      setQuiz({ target, options: shuffle([target, ...distractors], seed + 13), answer: null });
      setHotspotId(null);
      sceneRef.current?.focusHotspot(target);
    },
    [],
  );

  function startRevision() {
    if (!organ?.hotspots.length) return;
    setMode("revision");
    setScore({ ok: 0, total: 0 });
    setQuery("");
    nextQuestion(organ);
  }
  function stopRevision() {
    setMode("explorer");
    setQuiz(null);
  }
  function answer(id) {
    if (!quiz || quiz.answer) return;
    setQuiz({ ...quiz, answer: id });
    setScore((s) => ({ ok: s.ok + (id === quiz.target.id ? 1 : 0), total: s.total + 1 }));
  }

  // Switching specimen mid-drill restarts it on the new one.
  useEffect(() => {
    if (mode === "revision" && organ) nextQuestion(organ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organId]);

  return (
    <div className={`an-shell${isFull ? " is-full" : ""}${railOpen ? " rail-open" : ""}`} ref={shellRef}>
      <header className="an-top">
        <Link href={isStaff ? "/teacher/" : "/student/"} className="an-back">
          <BrandMark />
          <span className="an-back-txt">
            <Icon name="home" /> Tableau de bord
          </span>
        </Link>
        <div className="an-title">
          <h1>Simulation d'anatomie</h1>
          <p>
            {organs.length} spécimens 3D · {organs.reduce((n, o) => n + o.hotspots.length, 0)} structures repérées ·
            entièrement hors ligne
          </p>
        </div>
        <div className="an-top-right">
          <OfflinePill />
          <button className="an-rail-btn" onClick={() => setRailOpen((v) => !v)} aria-label="Spécimens">
            <Icon name="layers" />
          </button>
        </div>
      </header>

      <div className="an-body">
        {/* ---------- left rail: the library ---------- */}
        <aside className="an-rail an-rail-left">
          <div className="an-search">
            <Icon name="search" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un organe, une structure…"
              disabled={mode === "revision"}
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Effacer">
                <Icon name="x" />
              </button>
            )}
          </div>

          {mode === "revision" ? (
            <p className="an-rail-locked">
              <Icon name="eye" /> Bibliothèque masquée pendant la révision.
            </p>
          ) : (
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
                          <span className="an-glyph">{o.icon}</span>
                          <span className="an-item-txt">
                            <strong>{o.name}</strong>
                            <em>{o.scientificName}</em>
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
          )}
        </aside>

        {/* ---------- centre: the specimen ---------- */}
        <main className="an-stage">
          {webgl === false ? (
            <div className="an-fallback">
              <Icon name="alert" />
              <h2>La 3D n'est pas disponible sur cet appareil</h2>
              <p>
                Ce navigateur ne prend pas en charge WebGL. La bibliothèque, les fiches détaillées et le Copilote
                restent utilisables : choisissez un organe à gauche pour lire sa description.
              </p>
            </div>
          ) : (
            <AnatomyScene
              handle={sceneRef}
              organ={organ}
              hotspotId={hotspotId}
              onPickHotspot={pickHotspot}
              pinMode={mode === "revision" ? "quiz" : "all"}
              quizHotspotId={quiz?.target?.id ?? null}
            />
          )}

          <div className="an-tools">
            <div className="an-tool-grp">
              {VIEWS.map((v) => (
                <button key={v.id} onClick={() => sceneRef.current?.view(v.id)}>
                  {v.label}
                </button>
              ))}
              <button onClick={() => sceneRef.current?.reset()} title="Recadrer">
                <Icon name="refresh" />
              </button>
            </div>
            <div className="an-tool-grp">
              <button
                className={mode === "revision" ? "is-on" : ""}
                onClick={mode === "revision" ? stopRevision : startRevision}
                disabled={!organ?.hotspots.length}
              >
                <Icon name="target" /> {mode === "revision" ? "Quitter la révision" : "Mode révision"}
              </button>
              <button onClick={toggleFull} title={isFull ? "Quitter le plein écran" : "Plein écran"}>
                <Icon name={isFull ? "x" : "eye"} />
              </button>
            </div>
          </div>
          <p className="an-hint">
            Faites glisser pour tourner · molette ou pincement pour zoomer · touchez une pastille pour ouvrir la
            structure
          </p>
        </main>

        {/* ---------- right rail: the reading ---------- */}
        <aside className="an-rail an-rail-right" ref={detailRef}>
          {mode === "revision" ? (
            <section className="an-quiz">
              <header>
                <h2>
                  <Icon name="target" /> Mode révision
                </h2>
                <span className="an-score">
                  {score.ok} / {score.total}
                </span>
              </header>
              <p className="an-quiz-q">
                Quelle structure {ofOrgan(organ)} est marquée sur le spécimen ?
              </p>
              <div className="an-quiz-opts">
                {quiz?.options.map((o) => {
                  const done = !!quiz.answer;
                  const isRight = o.id === quiz.target.id;
                  const chosen = quiz.answer === o.id;
                  return (
                    <button
                      key={o.id + o.label}
                      className={`an-opt${done && isRight ? " is-right" : ""}${done && chosen && !isRight ? " is-wrong" : ""}`}
                      onClick={() => answer(o.id)}
                      disabled={done}
                    >
                      {o.label}
                      {done && isRight && <Icon name="check" />}
                      {done && chosen && !isRight && <Icon name="x" />}
                    </button>
                  );
                })}
              </div>
              {quiz?.answer && (
                <div className="an-quiz-after">
                  <p className="an-quiz-role">
                    <strong>{quiz.target.label}</strong> — {quiz.target.detail}
                  </p>
                  <button className="an-next" onClick={() => nextQuestion(organ)}>
                    Structure suivante <Icon name="play" />
                  </button>
                </div>
              )}
              <button className="an-quiz-quit" onClick={stopRevision}>
                Revenir à l'exploration
              </button>
            </section>
          ) : showSystem && sheet ? (
            <section className="an-card an-sheet">
              <button className="an-back-link" onClick={() => setShowSystem(false)}>
                <Icon name="x" /> Fermer la fiche système
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
                      Fiche système <Icon name="book" />
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
                  <Icon name="sparkles" /> {organ.funFact}
                </p>
              </section>

              <section className="an-card an-hotspots">
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
                        <strong>{h.label}</strong>
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
                <section className="an-card an-conds">
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

function hotspot_of(organ, id) {
  if (!organ || !id) return null;
  return organ.hotspots.find((h) => h.id === id) ?? null;
}
