"use client";
import { useState } from "react";
import "./components.css";
import Icon from "@/components/ui/Icon";
import { SUBJECTS, avatarColor, initials } from "@/lib/icons";
import { toast } from "@/lib/toast";

const SECTIONS = [
  ["colors", "Couleurs"],
  ["type", "Typographie"],
  ["buttons", "Boutons"],
  ["inputs", "Champs & contrôles"],
  ["badges", "Badges & état"],
  ["avatars", "Avatars & matières"],
  ["progress", "Progression"],
  ["nodes", "Nœuds de parcours"],
  ["chat", "Bulles de discussion"],
  ["feedback", "Notifications & fenêtres"],
  ["tokens", "Jetons"],
];

const SEM = [
  ["Primaire", "#4f46e5"],
  ["Succès", "#10b981"],
  ["Avertissement", "#f59e0b"],
  ["Danger", "#f43f5e"],
  ["Info", "#3b82f6"],
  ["Ardoise 900", "#0f172a"],
];

const INDIGO = ["#eef2ff", "#e0e7ff", "#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5", "#4338ca", "#3730a3", "#312e81"];
const SLATE = ["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b", "#0f172a"];
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const NAMES = ["Amani Kabasele", "Grâce Mukendi", "Espoir Tshibanda", "Jonathan Mwamba"];
const AVATAR_SIZES = ["avatar-sm", "", "avatar-lg", "avatar-xl"];

// SVG progress ring — deterministic, no random/date in render.
function Ring({ pct, color }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <div className="ring">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--slate-200)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <span className="pct">{pct}%</span>
    </div>
  );
}

export default function ComponentsPage() {
  const [theme, setTheme] = useState("light");
  // interactive demo state
  const [toggles, setToggles] = useState([true, false]);
  const [checks, setChecks] = useState([true, false]);
  const [seg, setSeg] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  const flip = (arr, setArr, i) =>
    setArr(arr.map((v, idx) => (idx === i ? !v : v)));

  return (
    <div className="comp-page" data-theme={theme}>
      <div className="cs-top">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="logo" />
          </span>{" "}
          Mwalimu · Design System
        </div>
        <div className="meta">
          <a href="/" className="btn btn-ghost btn-sm">
            <Icon name="home" /> Hub
          </a>
          <div className="theme-toggle">
            <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>
              <Icon name="sparkles" /> Clair
            </button>
            <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>
              <Icon name="book" /> Sombre
            </button>
          </div>
        </div>
      </div>

      <div className="cs-layout">
        <nav className="cs-nav">
          {SECTIONS.map(([id, l]) => (
            <a key={id} href={`#sec-${id}`}>
              {l}
            </a>
          ))}
        </nav>

        <main className="cs-main">
          <header>
            <h1>Fiche des composants</h1>
            <p>
              Les briques de base de Mwalimu — Lexend + Inter, une palette indigo/émeraude/ambre sur des neutres ardoise,
              des ombres douces et des rayons de 8 à 22 px. Activez le mode sombre (en haut à droite) pour prévisualiser chaque jeton dans les deux thèmes.
            </p>
          </header>

          {/* COLORS */}
          <section className="cs-sec" id="sec-colors">
            <h2>Couleurs</h2>
            <div className="cs-grid">
              <div className="demo">
                <div className="dl">Marque & sémantique</div>
                <div className="swatches">
                  {SEM.map(([n, h]) => (
                    <div className="sw" key={n}>
                      <div className="chip" style={{ background: h }} />
                      <div className="info">
                        <div className="n">{n}</div>
                        <div className="h">{h}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="demo">
                <div className="dl">Échelle indigo (primaire)</div>
                <div className="scale-row">
                  {INDIGO.map((color, i) => (
                    <div className="s" key={color} style={{ background: color, color: i > 4 ? "#fff" : "#334155" }}>
                      {STEPS[i]}
                    </div>
                  ))}
                </div>
                <div className="dl" style={{ marginTop: "16px" }}>
                  Neutres ardoise
                </div>
                <div className="scale-row">
                  {SLATE.map((color, i) => (
                    <div className="s" key={color} style={{ background: color, color: i > 4 ? "#fff" : "#334155" }}>
                      {STEPS[i]}
                    </div>
                  ))}
                </div>
              </div>
              <div className="demo">
                <div className="dl">Accents par matière</div>
                <div className="demo-row">
                  {Object.values(SUBJECTS).map((s) => (
                    <div key={s.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                      <span className={`subject-tile ${s.cls}`}>
                        <Icon name={s.key} />
                      </span>
                      <span className="tiny" style={{ fontWeight: 600 }}>
                        {s.en}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* TYPE */}
          <section className="cs-sec" id="sec-type">
            <h2>Typographie</h2>
            <div className="demo">
              <div className="dl">Lexend — titres · Inter — interface & corps</div>
              <div className="type-row">
                <span className="spec">Affichage / 32</span>
                <span style={{ fontFamily: "var(--font-head)", fontWeight: 700, fontSize: "32px", letterSpacing: "-.02em" }}>
                  Apprendre sans limites
                </span>
              </div>
              <div className="type-row">
                <span className="spec">H1 / 26</span>
                <span style={{ fontFamily: "var(--font-head)", fontWeight: 600, fontSize: "26px" }}>Tableau de bord de l’élève</span>
              </div>
              <div className="type-row">
                <span className="spec">H2 / 20</span>
                <span style={{ fontFamily: "var(--font-head)", fontWeight: 600, fontSize: "20px" }}>Votre parcours d’apprentissage</span>
              </div>
              <div className="type-row">
                <span className="spec">Corps / 16</span>
                <span style={{ fontSize: "16px", color: "var(--text-soft)" }}>
                  Éliminez d’abord le dénominateur en multipliant chaque terme.
                </span>
              </div>
              <div className="type-row">
                <span className="spec">Étiquette / 13 · 600</span>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>Score moyen au quiz</span>
              </div>
              <div className="type-row">
                <span className="spec">Mono / 13</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px" }}>gemma2:2b · 3.4 GB</span>
              </div>
            </div>
          </section>

          {/* BUTTONS */}
          <section className="cs-sec" id="sec-buttons">
            <h2>Boutons</h2>
            <div className="demo demo-rows">
              <div>
                <div className="dl">Variantes</div>
                <div className="demo-row">
                  <button className="btn btn-primary">Primaire</button>
                  <button className="btn btn-secondary">Secondaire</button>
                  <button className="btn btn-ghost">Discret</button>
                  <button className="btn btn-success">Succès</button>
                  <button className="btn btn-danger">Danger</button>
                  <button className="btn btn-primary" disabled>
                    Désactivé
                  </button>
                </div>
              </div>
              <div>
                <div className="dl">Tailles & icônes</div>
                <div className="demo-row">
                  <button className="btn btn-primary btn-lg">
                    Grand <Icon name="arrowR" />
                  </button>
                  <button className="btn btn-primary">Par défaut</button>
                  <button className="btn btn-primary btn-sm">Petit</button>
                  <button className="btn btn-secondary btn-icon">
                    <Icon name="settings" />
                  </button>
                  <button className="btn btn-secondary">
                    <Icon name="download" /> Avec icône
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* INPUTS */}
          <section className="cs-sec" id="sec-inputs">
            <h2>Champs & contrôles</h2>
            <div className="cs-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="demo demo-rows">
                <div className="field">
                  <label>Champ de texte</label>
                  <input className="input" placeholder="Saisissez votre nom…" />
                </div>
                <div className="field">
                  <label>Sélectionné</label>
                  <input
                    className="input"
                    defaultValue="5e Scientifique A"
                    style={{ borderColor: "var(--indigo-400)", boxShadow: "var(--ring)" }}
                  />
                </div>
                <div className="field">
                  <label>Liste déroulante</label>
                  <select className="select">
                    <option>Mathématiques</option>
                    <option>SVT</option>
                  </select>
                </div>
              </div>
              <div className="demo demo-rows">
                <div>
                  <div className="dl">Interrupteurs</div>
                  <div className="demo-row">
                    <button
                      className={`tg-demo ${toggles[0] ? "on" : ""}`.trim()}
                      onClick={() => flip(toggles, setToggles, 0)}
                      aria-pressed={toggles[0]}
                    />
                    <span className="tiny">Activé</span>
                    <button
                      className={`tg-demo ${toggles[1] ? "on" : ""}`.trim()}
                      onClick={() => flip(toggles, setToggles, 1)}
                      aria-pressed={toggles[1]}
                      style={{ marginLeft: "14px" }}
                    />
                    <span className="tiny">Désactivé</span>
                  </div>
                </div>
                <div>
                  <div className="dl">Cases à cocher</div>
                  <div className="demo-row">
                    <span
                      className={`cbx-demo ${checks[0] ? "on" : ""}`.trim()}
                      onClick={() => flip(checks, setChecks, 0)}
                      role="checkbox"
                      aria-checked={checks[0]}
                    >
                      <Icon name="check" />
                    </span>
                    <span
                      className={`cbx-demo ${checks[1] ? "on" : ""}`.trim()}
                      onClick={() => flip(checks, setChecks, 1)}
                      role="checkbox"
                      aria-checked={checks[1]}
                    >
                      <Icon name="check" />
                    </span>
                  </div>
                </div>
                <div>
                  <div className="dl">Segmenté</div>
                  <div className="seg-demo">
                    {["Parcours", "Sinueux", "Liste"].map((label, i) => (
                      <button key={label} className={seg === i ? "active" : ""} onClick={() => setSeg(i)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* BADGES */}
          <section className="cs-sec" id="sec-badges">
            <h2>Badges, puces & état</h2>
            <div className="demo demo-rows">
              <div>
                <div className="dl">Badges</div>
                <div className="demo-row">
                  <span className="badge">Par défaut</span>
                  <span className="badge badge-primary">Primaire</span>
                  <span className="badge badge-success">Sur la bonne voie</span>
                  <span className="badge badge-warning">En retard</span>
                  <span className="badge badge-danger">Inactif</span>
                </div>
              </div>
              <div>
                <div className="dl">Puces & étiquettes d’état</div>
                <div className="demo-row">
                  <span className="chip">Expliquer autrement</span>
                  <span className="chip">Donner un exemple</span>
                  <span className="status-tag ok">
                    <span className="sdot ok" />
                    Sur la bonne voie
                  </span>
                  <span className="status-tag behind">
                    <span className="sdot behind" />
                    En retard
                  </span>
                  <span className="status-tag inactive">
                    <span className="sdot inactive" />
                    Inactif
                  </span>
                </div>
              </div>
              <div>
                <div className="dl">Pastille hors ligne</div>
                <div className="demo-row">
                  <span className="offline-pill">
                    <span className="dot" /> Serveur local connecté
                  </span>
                  <span className="offline-pill off">
                    <span className="dot" /> Serveur déconnecté
                  </span>
                </div>
              </div>
              <div>
                <div className="dl">Ludification</div>
                <div className="demo-row">
                  <span className="stat-pill">
                    <Icon name="flame" style={{ color: "var(--warning)" }} /> Série de 7 jours
                  </span>
                  <span className="stat-pill">
                    <Icon name="xp" style={{ color: "var(--indigo-500)" }} /> 1 240 XP
                  </span>
                  <span className="stat-pill">
                    <Icon name="trophy" style={{ color: "var(--indigo-500)" }} /> Niveau 5
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* AVATARS + SUBJECTS */}
          <section className="cs-sec" id="sec-avatars">
            <h2>Avatars & tuiles de matière</h2>
            <div className="cs-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="demo">
                <div className="dl">Avatars</div>
                <div className="demo-row">
                  {NAMES.map((n, i) => (
                    <span
                      key={n}
                      className={`avatar ${AVATAR_SIZES[i]}`.trim()}
                      style={{ background: avatarColor(n) }}
                    >
                      {initials(n)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="demo">
                <div className="dl">Tuiles de matière</div>
                <div className="demo-row">
                  {Object.values(SUBJECTS).map((s) => (
                    <span key={s.key} className={`subject-tile ${s.cls}`}>
                      <Icon name={s.key} />
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* PROGRESS */}
          <section className="cs-sec" id="sec-progress">
            <h2>Progression</h2>
            <div className="cs-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="demo">
                <div className="dl">Anneaux</div>
                <div className="ring-demo">
                  <Ring pct={38} color="var(--primary)" />
                  <Ring pct={72} color="var(--success)" />
                  <Ring pct={100} color="var(--warning)" />
                </div>
              </div>
              <div className="demo demo-rows">
                <div className="dl">Barres</div>
                <div className="pbar">
                  <span style={{ width: "38%" }} />
                </div>
                <div className="pbar success">
                  <span style={{ width: "72%" }} />
                </div>
                <div className="pbar">
                  <span style={{ width: "100%" }} />
                </div>
              </div>
            </div>
          </section>

          {/* PATH NODES */}
          <section className="cs-sec" id="sec-nodes">
            <h2>Nœuds du parcours d’apprentissage</h2>
            <div className="demo">
              <div className="nodes-demo">
                <div className="node-demo">
                  <div className="node-circle nc-done">
                    <Icon name="check" />
                  </div>
                  <span className="nl">Terminé</span>
                </div>
                <div className="node-demo">
                  <div className="node-circle nc-current">
                    <Icon name="play" />
                  </div>
                  <span className="nl">En cours</span>
                </div>
                <div className="node-demo">
                  <div className="node-circle nc-locked">
                    <Icon name="lock" />
                  </div>
                  <span className="nl">Verrouillé</span>
                </div>
                <div className="node-demo">
                  <div className="node-circle nc-quiz">
                    <Icon name="trophy" />
                  </div>
                  <span className="nl">Quiz</span>
                </div>
              </div>
            </div>
          </section>

          {/* CHAT */}
          <section className="cs-sec" id="sec-chat">
            <h2>Bulles de discussion du Copilote</h2>
            <div className="demo">
              <div className="chat-demo">
                <div className="msg bot">
                  <span className="mav">
                    <Icon name="sparkles" />
                  </span>
                  <div className="bubble">Bonjour Amani ! Posez-moi vos questions sur cette leçon.</div>
                </div>
                <div className="msg me">
                  <span className="mav">A</span>
                  <div className="bubble">Comment diviser des fractions ?</div>
                </div>
                <div className="msg bot">
                  <span className="mav">
                    <Icon name="sparkles" />
                  </span>
                  <div className="bubble typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* FEEDBACK */}
          <section className="cs-sec" id="sec-feedback">
            <h2>Notifications, fenêtres & états vides</h2>
            <div className="cs-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="demo demo-rows">
                <div className="dl">Déclencheurs</div>
                <div className="demo-row">
                  <button className="btn btn-secondary" onClick={() => toast("Leçon enregistrée · +50 XP", { icon: "check", color: "#6ee7b7" })}>
                    Notification de succès
                  </button>
                  <button className="btn btn-secondary" onClick={() => toast("Le Copilote a été suspendu par votre enseignant", { icon: "info" })}>
                    Notification d’info
                  </button>
                  <button className="btn btn-secondary" onClick={() => setModalOpen(true)}>
                    Ouvrir la fenêtre
                  </button>
                </div>
              </div>
              <div className="demo">
                <div className="dl">État vide</div>
                <div className="empty">
                  <div className="eic">
                    <Icon name="search" />
                  </div>
                  <h4>Aucun résultat</h4>
                  <p>Aucun élève ne correspond à votre recherche. Essayez un autre nom.</p>
                </div>
              </div>
            </div>
          </section>

          {/* TOKENS */}
          <section className="cs-sec" id="sec-tokens">
            <h2>Jetons — rayons, ombres, espacement</h2>
            <div className="cs-grid">
              <div className="demo">
                <div className="dl">Rayons</div>
                <div className="radii-demo">
                  {[
                    ["8px", "8px"],
                    ["12px", "12px"],
                    ["16px", "16px"],
                    ["22px", "22px"],
                    ["999px", "pill"],
                  ].map(([radius, lbl]) => (
                    <div className="rd" key={lbl}>
                      <div className="box" style={{ borderRadius: radius }} />
                      <div className="lbl">{lbl}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="demo">
                <div className="dl">Ombres</div>
                <div className="shadow-demo">
                  {["xs", "sm", "md", "lg", "xl"].map((s) => (
                    <div className="sd" key={s} style={{ boxShadow: `var(--sh-${s})` }}>
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", marginBottom: "6px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: "var(--warning-bg)",
                  color: "var(--warning-fg)",
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                }}
              >
                <Icon name="pause" />
              </div>
              <div>
                <h2 style={{ fontSize: "20px" }}>Suspendre le Copilote pour la classe ?</h2>
                <p className="muted" style={{ fontSize: "14px", marginTop: "6px" }}>
                  Les 28 élèves perdront l’accès au tuteur IA jusqu’à ce que vous le réactiviez.
                </p>
              </div>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: "10px", marginTop: "22px" }}>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Annuler
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setModalOpen(false);
                  toast("Copilote suspendu pour la classe", { icon: "pause" });
                }}
              >
                Suspendre pour tous
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
