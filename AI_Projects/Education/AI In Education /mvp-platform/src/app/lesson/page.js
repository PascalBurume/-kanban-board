"use client";
import "./lesson.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import Markdown from "@/components/Markdown";
import { LangToggle } from "@/components/ui/chrome";
import { toast } from "@/lib/toast";
import { useFullscreen } from "@/lib/fullscreen";
import UnderstandingRating from "@/components/UnderstandingRating";
import { chipPool, rotateChips } from "@/lib/copilotSuggestions";
import { extractHighlights } from "@/lib/highlights";

let MSG_ID = 0;
const nextMsgId = () => ++MSG_ID;

/* ---- "Dans cette leçon" table of contents ---- */
function TocBar({ contentMd, scrollRef }) {
  const heads = useMemo(() => {
    const out = [];
    for (const line of (contentMd || "").split("\n")) {
      const m = line.match(/^(#{2,3})\s+(.*)/);
      if (m) out.push(m[2].replace(/[*_`$]/g, "").trim());
    }
    return out.slice(0, 8);
  }, [contentMd]);
  if (heads.length < 2) return null;
  const go = (text) => {
    const root = scrollRef.current;
    if (!root) return;
    const hs = [...root.querySelectorAll("h2, h3")];
    const el = hs.find((h) => h.textContent.trim().startsWith(text.slice(0, 22)));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="lesson-toc">
      <span className="toc-lbl">Dans cette leçon</span>
      {heads.map((h, i) => <button key={i} onClick={() => go(h)}>{h}</button>)}
    </div>
  );
}

const IDLE_MS = 60000; // pause tracking after ~60s with no input
const BEAT_SECONDS = 30; // POST a heartbeat every 30s of active time

export default function LessonPage() {
  /* ---- lesson id (read client-side to avoid prerender/Suspense) ---- */
  const [lessonId, setLessonId] = useState(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      window.location.href = "/student/";
      return;
    }
    setLessonId(id);
  }, []);

  /* ---- remote data ---- */
  const [data, setData] = useState(null); // { lesson, progress, quiz, nav }
  const [loadState, setLoadState] = useState("loading"); // loading | ready | notfound | error
  const [completed, setCompleted] = useState(false);
  const [nextId, setNextId] = useState(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!lessonId) return;
    let alive = true;
    setLoadState("loading");
    fetch(`/api/student/lessons/${lessonId}/`)
      .then(async (res) => {
        if (res.status === 403) {
          window.location.href = "/login/";
          return null;
        }
        if (res.status === 404) {
          if (alive) setLoadState("notfound");
          return null;
        }
        if (!res.ok) {
          if (alive) setLoadState("error");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (!alive || !json) return;
        setData(json);
        setCompleted(!!json.nav?.completed);
        setNextId(json.nav?.nextId ?? null);
        setSecs(json.progress?.totalSeconds ?? 0);
        setLoadState("ready");
      })
      .catch(() => {
        if (alive) setLoadState("error");
      });
    return () => {
      alive = false;
    };
  }, [lessonId]);

  /* ---- copilot panel ---- */
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(true); // copilot active / paused

  /* ---- time on lesson (active-only heartbeat) ---- */
  const [secs, setSecs] = useState(0);
  const pendingRef = useRef(0); // active seconds not yet sent
  const lastActivityRef = useRef(0);

  /* ---- quiz state ---- */
  const [answers, setAnswers] = useState({}); // { [questionId]: value }
  const [quizResult, setQuizResult] = useState(null); // { score, correct, total, results }
  const [submitting, setSubmitting] = useState(false);
  const quizStartRef = useRef(0);

  /* ---- copilot chat ---- */
  const greeting = () => ({
    id: nextMsgId(),
    who: "bot",
    text: "Salut 👋 Je suis là pour t'aider avec cette leçon. Pose-moi une question ou choisis une suggestion.",
  });
  const [messages, setMessages] = useState([greeting()]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const scrollRef = useRef(null);
  const msgsRef = useRef(null);
  const typingTimer = useRef(null);
  const shellRef = useRef(null);
  const { isFull, toggle: toggleFull } = useFullscreen(shellRef);

  // On narrow screens the Copilot is a slide-over drawer — start collapsed.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 1024) setCollapsed(true);
  }, []);

  /* ---- time tracking: tick while visible + not idle, beat every 30s ---- */
  const sendBeat = useCallback(
    (seconds) => {
      if (!lessonId || seconds <= 0) return;
      fetch(`/api/student/lessons/${lessonId}/heartbeat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds }),
      }).catch(() => {});
    },
    [lessonId]
  );

  useEffect(() => {
    if (loadState !== "ready") return;
    lastActivityRef.current = Date.now();
    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener("mousemove", markActivity);
    window.addEventListener("keydown", markActivity);
    window.addEventListener("click", markActivity);

    const id = setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastActivityRef.current > IDLE_MS) return;
      setSecs((s) => s + 1);
      pendingRef.current += 1;
      if (pendingRef.current >= BEAT_SECONDS) {
        sendBeat(pendingRef.current);
        pendingRef.current = 0;
      }
    }, 1000);

    return () => {
      clearInterval(id);
      window.removeEventListener("mousemove", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("click", markActivity);
      // flush remaining active seconds on unmount
      if (pendingRef.current > 0) {
        sendBeat(pendingRef.current);
        pendingRef.current = 0;
      }
    };
  }, [loadState, sendBeat]);

  // autoscroll chat to bottom on new message / typing
  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages, typing]);

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  // Load Copilot history + policy (enabled/paused) for this lesson.
  useEffect(() => {
    if (loadState !== "ready" || !lessonId) return;
    let alive = true;
    fetch(`/api/copilot/thread/?lessonId=${lessonId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        setActive(!!j.enabled);
        if (Array.isArray(j.messages) && j.messages.length) {
          setMessages(
            j.messages.map((m) => ({ id: nextMsgId(), who: m.role === "assistant" ? "bot" : "me", text: m.content }))
          );
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loadState, lessonId]);

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  /* ---- mark complete ---- */
  const onComplete = () => {
    if (!lessonId) return;
    fetch(`/api/student/lessons/${lessonId}/complete/`, { method: "POST" })
      .then(async (res) => {
        if (res.status === 403) {
          window.location.href = "/login/";
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((json) => {
        if (!json || !json.ok) {
          toast("Impossible de marquer comme terminé. Réessaie.", { icon: "alert", color: "#fca5a5" });
          return;
        }
        setCompleted(true);
        setNextId(json.nextId ?? null);
        const xp = json.xpGained ? ` +${json.xpGained} XP gagnés 🎉` : "";
        toast(`Leçon terminée !${xp}`, { icon: "check", color: "#6ee7b7" });
        setRatingOpen(true); // ask how well they understood
        setQuizOpen(false);
      })
      .catch(() => toast("Impossible de marquer comme terminé. Réessaie.", { icon: "alert", color: "#fca5a5" }));
  };

  /* ---- quiz ---- */
  const quiz = data?.quiz || null;

  useEffect(() => {
    // start the quiz duration clock once the quiz is available
    if (quiz && !quizStartRef.current) quizStartRef.current = Date.now();
  }, [quiz]);

  const setAnswer = (qid, value) => {
    if (quizResult) return; // locked after submit until retry
    setAnswers((a) => ({ ...a, [qid]: value }));
  };

  const allAnswered = quiz ? quiz.questions.every((q) => answers[q.id] !== undefined && answers[q.id] !== "") : false;

  const submitQuiz = () => {
    if (!quiz || submitting) return;
    setSubmitting(true);
    const durationS = quizStartRef.current ? Math.floor((Date.now() - quizStartRef.current) / 1000) : 0;
    fetch(`/api/student/quiz/${quiz.id}/attempt/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, durationS }),
    })
      .then(async (res) => {
        if (res.status === 403) {
          window.location.href = "/login/";
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((json) => {
        if (!json) {
          toast("Impossible d’envoyer le quiz. Réessaie.", { icon: "alert", color: "#fca5a5" });
          return;
        }
        setQuizResult(json);
        const msg =
          json.score === 100
            ? `Parfait ! ${json.correct}/${json.total} correctes 🎉`
            : `Score : ${json.score}% · ${json.correct}/${json.total} correctes`;
        toast(msg, { icon: json.score === 100 ? "trophy" : "target", color: "#a5b4fc" });
      })
      .catch(() => toast("Impossible d’envoyer le quiz. Réessaie.", { icon: "alert", color: "#fca5a5" }))
      .finally(() => setSubmitting(false));
  };

  const retryQuiz = () => {
    setQuizResult(null);
    setAnswers({});
    quizStartRef.current = Date.now();
  };

  /* ---- copilot chat: real streaming from the on-device tutor ---- */
  async function send(textArg) {
    const v = (typeof textArg === "string" ? textArg : input).trim();
    if (!v || streaming) return;
    if (!active) {
      toast("Le Copilot est en pause.", { icon: "pause" });
      return;
    }
    setInput("");
    setChipCursor((c) => c + 3); // rotate suggestions for the next turn
    const userId = nextMsgId();
    const botId = nextMsgId();
    setMessages((m) => [...m, { id: userId, who: "me", text: v }, { id: botId, who: "bot", text: "" }]);
    setTyping(true);
    setStreaming(true);
    try {
      const res = await fetch("/api/copilot/message/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, content: v }),
      });
      if (res.status === 403) {
        setActive(false);
        setMessages((m) => m.filter((x) => x.id !== botId));
        return;
      }
      if (res.status === 429) {
        setMessages((m) => m.filter((x) => x.id !== botId));
        toast("Trop de questions — patiente une minute.", { icon: "clock" });
        return;
      }
      if (res.status === 503) {
        setMessages((m) =>
          m.map((x) => (x.id === botId ? { ...x, text: "Le tuteur Copilot est indisponible hors-ligne pour le moment. Réessaie quand le serveur de l'école est connecté." } : x))
        );
        return;
      }
      if (!res.ok || !res.body) throw new Error("net");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let got = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (!line.startsWith("data: ")) continue;
          let o;
          try {
            o = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (o.delta) {
            if (!got) {
              got = true;
              setTyping(false);
            }
            setMessages((m) => m.map((x) => (x.id === botId ? { ...x, text: x.text + o.delta } : x)));
          }
          if (o.error) {
            setMessages((m) =>
              m.map((x) => (x.id === botId ? { ...x, text: x.text || "Désolé, une erreur s'est produite. Réessaie." } : x))
            );
          }
        }
      }
    } catch {
      setMessages((m) =>
        m.map((x) => (x.id === botId ? { ...x, text: x.text || "Connexion au Copilot impossible." } : x))
      );
    } finally {
      setTyping(false);
      setStreaming(false);
    }
  }
  const sendChip = (chip) => send(chip);

  // Contextual suggestion chips derived from this lesson's notions/objectives,
  // rotated each turn so a fresh set appears after the student picks/answers one.
  const chipPoolList = useMemo(
    () =>
      chipPool(
        data?.lesson
          ? { subject: data.lesson.subjectName, tab: "lesson", lesson: { title: data.lesson.title, ...extractHighlights(data.lesson.contentMd) } }
          : {}
      ),
    [data]
  );
  const [chipCursor, setChipCursor] = useState(0);
  useEffect(() => { setChipCursor(0); }, [chipPoolList]);
  const copilotChips = useMemo(() => rotateChips(chipPoolList, chipCursor, 3), [chipPoolList, chipCursor]);

  // Reset: clear the persisted thread and return the chat to its greeting.
  const [resetting, setResetting] = useState(false);
  async function resetChat() {
    if (streaming || resetting) return;
    // Nothing to reset if only the greeting is shown.
    if (messages.length <= 1) return;
    setResetting(true);
    setMessages([greeting()]);
    setInput("");
    try {
      await fetch(`/api/copilot/thread/?lessonId=${lessonId}`, { method: "DELETE" });
      toast("Conversation réinitialisée.", { icon: "refresh" });
    } catch {
      toast("Réinitialisation impossible — réessaie.", { icon: "alert" });
    } finally {
      setResetting(false);
    }
  }


  const onLangNotice = () =>
    toast("Le français complet arrive — interface en anglais pour cette revue.", { icon: "info" });

  /* ---- loading / error shells ---- */
  if (loadState === "loading" || loadState === "error") {
    return (
      <div className="lesson-page">
        <div className="lesson-shell">
          <div className="lesson-doc" style={{ padding: "60px 28px" }}>
            {loadState === "error" ? (
              <>
                <h1>Une erreur s’est produite</h1>
                <p className="muted">Nous n’avons pas pu charger cette leçon. Réessaie.</p>
                <a className="btn btn-secondary" href="/student/">
                  <Icon name="home" /> Retour à mon parcours
                </a>
              </>
            ) : (
              <p className="muted">Chargement de la leçon…</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loadState === "notfound") {
    return (
      <div className="lesson-page">
        <div className="lesson-shell">
          <div className="lesson-doc" style={{ padding: "60px 28px" }}>
            <h1>Leçon introuvable</h1>
            <p className="muted">Cette leçon n’est pas disponible, ou tu n’y as pas encore accès.</p>
            <a className="btn btn-secondary" href="/student/">
              <Icon name="home" /> Retour à mon parcours
            </a>
          </div>
        </div>
      </div>
    );
  }

  const { lesson, nav } = data;
  const subjClass = ["math", "svt", "sptic", "chimie", "physique"].includes(lesson.icon)
    ? `subj-${lesson.icon}`
    : "";
  const prevHref = nav.prevId ? `/lesson/?id=${nav.prevId}` : null;
  const nextHref = nextId ? `/lesson/?id=${nextId}` : null;

  return (
    <div className="lesson-page">
      <div className={`lesson-shell${isFull ? " is-full" : ""}`} ref={shellRef}>
        {/* Top */}
        <div className="lesson-top">
          <div className="crumb">
            <a className="back" href="/student/">
              <Icon name="home" /> Parcours
            </a>
            <span
              className={`subject-tile ${subjClass}`.trim()}
              style={{ width: "38px", height: "38px", color: lesson.color }}
            >
              <Icon name={lesson.icon} />
            </span>
            <div>
              <div className="ctitle">{lesson.title}</div>
              <div className="csub">
                {lesson.subjectName} · {lesson.moduleTitle}
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: "10px" }}>
            {lesson.moduleId && (
              <a className="practice-btn" href={`/practice/${lesson.moduleId}/`}>
                <Icon name="sparkles" /> Pratiquer ce chapitre
              </a>
            )}
            <div className="lesson-menu">
              <button className={`lesson-fs${menuOpen ? " on" : ""}`} onClick={() => setMenuOpen((o) => !o)} title="Plus d’options" aria-label="Plus d’options">
                <Icon name="dots" />
              </button>
              {menuOpen && (
                <>
                  <div className="lm-scrim" onClick={() => setMenuOpen(false)} />
                  <div className="lesson-menu-pop">
                    <div className="lm-row">
                      <span className="lm-ic"><Icon name="clock" /></span>
                      <span className="lm-label">Temps sur la leçon</span>
                      <b className="lm-val">{`${mm}:${ss}`}</b>
                    </div>
                    <div className="lm-row">
                      <span className="lm-ic ok"><span className="lm-dot" /></span>
                      <span className="lm-label">Serveur local connecté</span>
                    </div>
                    <button className="lm-row lm-btn" onClick={() => { toggleFull(); setMenuOpen(false); }}>
                      <span className="lm-ic"><Icon name="eye" /></span>
                      <span className="lm-label">{isFull ? "Quitter le plein écran" : "Plein écran"}</span>
                    </button>
                    <div className="lm-row">
                      <span className="lm-ic"><Icon name="settings" /></span>
                      <span className="lm-label">Langue</span>
                      <LangToggle onNotice={onLangNotice} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className={`lesson-body ${collapsed ? "collapsed" : ""}`.trim()} id="body">
          <div className="content-scroll" ref={scrollRef}>
            <div className="steps-bar" style={{ position: "sticky", top: 0, zIndex: 3 }}>
              <div className="steps-track">
                <i className={completed ? "done" : "cur"} />
              </div>
              <span className="steps-label">{`Leçon ${nav.index + 1} sur ${nav.total}`}</span>
            </div>

            <div className="lesson-doc">
              <div className="eyebrow">
                <Icon name="book" /> {lesson.moduleTitle}
              </div>
              <h1>{lesson.title}</h1>
              <TocBar contentMd={lesson.contentMd} scrollRef={scrollRef} />
              <Markdown>{lesson.contentMd}</Markdown>

              {data.companions?.length > 0 && (
                <section className="lesson-companions">
                  <div className="lc-head"><Icon name="sparkles" /> Compléments du prof</div>
                  {data.companions.map((c) => (
                    <article className="lc-card" key={c.id}>
                      <div className="lc-card-head">
                        <h3>{c.title}</h3>
                        {c.authorName && <span className="lc-by">par {c.authorName}</span>}
                      </div>
                      <div className="lc-body"><Markdown>{c.contentMd}</Markdown></div>
                    </article>
                  ))}
                </section>
              )}

              {quiz && (
                <div className="quiz-cta">
                  <div className="qc-ic"><Icon name="target" /></div>
                  <div className="qc-body">
                    <h3>Vérifier mes acquis</h3>
                    <p>{quiz.questions.length} question{quiz.questions.length > 1 ? "s" : ""} pour faire le point sur cette leçon.</p>
                  </div>
                  <button className="btn btn-primary" onClick={() => setQuizOpen(true)}>
                    {quizResult ? "Revoir le quiz" : "Faire le quiz"} <Icon name="arrowR" />
                  </button>
                </div>
              )}

              {completed && nextHref && (
                <div style={{ marginTop: "22px" }}>
                  <a className="btn btn-success btn-lg btn-block" href={nextHref}>
                    Continuer vers la leçon suivante <Icon name="arrowR" />
                  </a>
                </div>
              )}
            </div>

            <div className="lesson-foot">
              <div className="inner">
                {prevHref ? (
                  <a className="btn btn-secondary" href={prevHref}>
                    <Icon name="chevL" /> Précédent
                  </a>
                ) : (
                  <span className="btn btn-secondary" style={{ visibility: "hidden" }}>
                    <Icon name="chevL" /> Précédent
                  </span>
                )}

                {!completed && (
                  <button className="btn btn-ghost" onClick={onComplete}>
                    <Icon name="check" /> Marquer comme terminé
                  </button>
                )}

                {nextHref ? (
                  <a className="btn btn-primary" href={nextHref}>
                    Suivant <Icon name="arrowR" />
                  </a>
                ) : (
                  <button className="btn btn-primary" disabled title={completed ? "Dernière leçon" : "Termine cette leçon pour débloquer la suite"}>
                    Suivant <Icon name="arrowR" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Copilot — on-device tutor (streams from /api/copilot/message) */}
          <aside className="copilot">
            <div className="cop-head">
              <span className="cop-avatar">
                <Icon name="sparkles" />
              </span>
              <div>
                <div className="ct">Copilot</div>
                <div className="cs">
                  <span className="dot" /> T’aide avec cette leçon
                </div>
              </div>
              <button
                className="cop-reset"
                title="Réinitialiser la conversation"
                onClick={resetChat}
                disabled={streaming || resetting || messages.length <= 1}
              >
                <Icon name="refresh" />
              </button>
              <button className="cop-collapse" title="Réduire" onClick={() => setCollapsed(true)}>
                <Icon name="chevR" />
              </button>
            </div>
            <div className="cop-rel">
              <div className="cop-msgs" ref={msgsRef}>
                {messages.map((m) => (
                  <div className={`msg ${m.who}`} key={m.id}>
                    <span className="mav">{m.who === "bot" ? <Icon name="sparkles" /> : "A"}</span>
                    <div className="bubble">
                      {m.who === "bot" ? (
                        m.text ? (
                          <Markdown>{m.text}</Markdown>
                        ) : (
                          <div className="typing">
                            <span />
                            <span />
                            <span />
                          </div>
                        )
                      ) : (
                        m.text
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="cop-chips">
                {copilotChips.map((c) => (
                  <button className="chip" key={c} onClick={() => sendChip(c)} disabled={streaming}>
                    {c}
                  </button>
                ))}
              </div>
              <div className="cop-input">
                <input
                  className="input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send();
                  }}
                  placeholder={streaming ? "Copilot écrit…" : "Pose une question sur la leçon…"}
                  autoComplete="off"
                  disabled={streaming}
                />
                <button className="cop-send" onClick={() => send()} disabled={streaming}>
                  <Icon name="send" />
                </button>
              </div>
              <p className="cop-disclaimer">
                <Icon name="sparkles" /> Le Copilot peut se tromper — vérifie les informations importantes.
              </p>
              {!active && (
                <div className="cop-disabled" style={{ display: "flex" }}>
                  <div className="di">
                    <Icon name="pause" />
                  </div>
                  <h4>Le Copilot est en pause</h4>
                  <p>
                    Ton enseignant a mis le Copilot en pause pour cette leçon. Tu peux toujours lire et terminer la leçon.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {collapsed && (
        <button className="cop-reopen" style={{ display: "flex" }} onClick={() => setCollapsed(false)}>
          <Icon name="sparkles" /> Copilot
        </button>
      )}

      {/* Quiz popup */}
      {quizOpen && quiz && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setQuizOpen(false); }}>
          <div className="modal quiz-modal">
            <button className="modal-x" onClick={() => setQuizOpen(false)} title="Fermer"><Icon name="x" /></button>
            <Quiz
              quiz={quiz}
              answers={answers}
              setAnswer={setAnswer}
              result={quizResult}
              submitting={submitting}
              allAnswered={allAnswered}
              onSubmit={submitQuiz}
              onRetry={retryQuiz}
            />
          </div>
        </div>
      )}

      {/* Post-lesson understanding popup */}
      {ratingOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRatingOpen(false); }}>
          <div className="modal rating-modal">
            <div className="modal-head"><h2>Bravo, leçon terminée ! 🎉</h2></div>
            <p className="muted" style={{ marginBottom: 16 }}>À quel point as-tu compris « {lesson.title} » ?</p>
            <UnderstandingRating lessonId={lessonId} autoSubmitFull onSaved={() => setRatingOpen(false)} />
            <button className="modal-skip" onClick={() => setRatingOpen(false)}>Plus tard</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Quiz card (real questions + auto-graded feedback) ---- */
function Quiz({ quiz, answers, setAnswer, result, submitting, allAnswered, onSubmit, onRetry }) {
  const byId = result ? Object.fromEntries(result.results.map((r) => [r.questionId, r])) : null;

  return (
    <div className="quiz-card" style={{ marginTop: "28px" }}>
      <div className="qh">
        <span className="badge badge-warning">
          <Icon name="target" /> {quiz.title || "Quiz de fin de leçon"}
        </span>
      </div>
      <h2>Vérification rapide</h2>
      <p className="muted">Réponds aux questions ci-dessous pour vérifier ta compréhension.</p>

      {result && (
        <div className={`quiz-feedback show ${result.score >= 50 ? "ok" : "no"}`} style={{ marginTop: "16px" }}>
          <div className="fic">
            <Icon name={result.score === 100 ? "trophy" : result.score >= 50 ? "check" : "x"} />
          </div>
          <div className="ft">
            <b>
              Score : {result.score}% — {result.correct}/{result.total} correctes
            </b>
          </div>
        </div>
      )}

      {quiz.questions.map((q, qi) => {
        const r = byId ? byId[q.id] : null;
        const given = answers[q.id];
        return (
          <div key={q.id} style={{ marginTop: qi === 0 ? "18px" : "26px" }}>
            <div className="quiz-q">
              <span style={{ color: "var(--text-muted)", marginRight: "8px" }}>{qi + 1}.</span>
              <Markdown>{q.promptMd}</Markdown>
            </div>

            {q.type === "MCQ" && (
              <div className="quiz-opts">
                {(q.options || []).map((opt, oi) => {
                  const KEY = String.fromCharCode(65 + oi); // A, B, C…
                  let cls = "quiz-opt";
                  let mark = null;
                  if (result) {
                    cls += " disabled";
                    if (r && oi === Number(r.correctAnswer)) {
                      cls += " correct";
                      mark = <Icon name="check" />;
                    } else if (oi === Number(given)) {
                      cls += " wrong";
                      mark = <Icon name="x" />;
                    }
                  } else if (oi === Number(given)) {
                    cls += " correct";
                  }
                  return (
                    <button className={cls} key={oi} onClick={() => setAnswer(q.id, oi)}>
                      <span className="key">{KEY}</span>
                      <span className="opt-md"><Markdown>{String(opt)}</Markdown></span>
                      <span className="mark">{mark}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "TF" && (
              <div className="quiz-opts">
                {[
                  ["Vrai", true],
                  ["Faux", false],
                ].map(([label, val]) => {
                  let cls = "quiz-opt";
                  let mark = null;
                  if (result) {
                    cls += " disabled";
                    if (r && Boolean(r.correctAnswer) === val) {
                      cls += " correct";
                      mark = <Icon name="check" />;
                    } else if (given === val) {
                      cls += " wrong";
                      mark = <Icon name="x" />;
                    }
                  } else if (given === val) {
                    cls += " correct";
                  }
                  return (
                    <button className={cls} key={label} onClick={() => setAnswer(q.id, val)}>
                      <span className="key">{val ? "V" : "F"}</span>
                      {label}
                      <span className="mark">{mark}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "SHORT" && (
              <input
                className="input"
                style={{ width: "100%", marginTop: "4px" }}
                value={given ?? ""}
                disabled={!!result}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder="Saisis ta réponse…"
                autoComplete="off"
              />
            )}

            {r && (
              <div className={`quiz-feedback show ${r.correct ? "ok" : "no"}`}>
                <div className="fic">
                  <Icon name={r.correct ? "check" : "x"} />
                </div>
                <div className="ft">
                  <b>{r.correct ? "Bonne réponse !" : "Pas tout à fait."}</b>
                  {!r.correct && q.type === "SHORT" && (
                    <>
                      {" "}
                      Attendu :{" "}
                      <b>
                        {Array.isArray(r.correctAnswer) ? r.correctAnswer.join(", ") : String(r.correctAnswer)}
                      </b>
                      .
                    </>
                  )}
                  {r.explanationMd && <Markdown>{r.explanationMd}</Markdown>}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: "20px", display: "block" }}>
        {!result ? (
          <button
            className="btn btn-primary btn-lg btn-block"
            onClick={onSubmit}
            disabled={submitting || !allAnswered}
          >
            <Icon name="check" /> {submitting ? "Envoi…" : "Valider"}
          </button>
        ) : (
          <button className="btn btn-secondary btn-lg btn-block" onClick={onRetry}>
            <Icon name="refresh" /> Réessayer
          </button>
        )}
      </div>
    </div>
  );
}
