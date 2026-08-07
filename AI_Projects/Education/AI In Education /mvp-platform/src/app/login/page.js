"use client";
import { useState, useEffect, useRef } from "react";
import "./login.css";
import Icon from "@/components/ui/Icon";
import { BrandMark, Avatar } from "@/components/ui/chrome";
import { toast } from "@/lib/toast";

const ACCENTS = ["math", "physique", "svt", "chimie", "sptic"];
const fullName = (s) => `${s.firstName} ${s.lastName}`.trim();

/* ---- Step dots ---- */
function StepDots({ n }) {
  return (
    <div className="step-dots">
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? "on" : ""} />
      ))}
    </div>
  );
}

/* ---- Step 1: class ---- */
function ClassStep({ classes, loading, onPick, onStaff }) {
  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">Étape 1 sur 3 <StepDots n={1} /></div>
        <h2>Choisissez votre classe</h2>
        <p>Sélectionnez la classe à laquelle vous appartenez. Vous ne verrez que vos propres leçons.</p>
      </div>
      {loading ? (
        <div className="muted" style={{ padding: "24px 4px" }}>Chargement des classes…</div>
      ) : classes.length === 0 ? (
        <div className="muted" style={{ padding: "24px 4px" }}>Aucune classe pour l’instant. Demandez à votre administrateur.</div>
      ) : (
        <div className="class-grid">
          {classes.map((c, i) => (
            <button key={c.id} className="card card-hover class-card reveal" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }} onClick={() => onPick(c)}>
              <div className="cc-top">
                <div>
                  <h3>{c.name}</h3>
                  <div className="niveau">{[c.level, c.field].filter(Boolean).join(" · ")}</div>
                </div>
                <span className={`subject-tile subj-${ACCENTS[i % ACCENTS.length]}`}>
                  <Icon name={ACCENTS[i % ACCENTS.length]} />
                </span>
              </div>
              <div className="cc-foot">
                <div className="teacher">
                  <Avatar name={c.teacher || "—"} size="avatar-sm" />
                  <span className="nm">{c.teacher || "Non attribué"}</span>
                </div>
                <span className="count-pill"><Icon name="users" /> {c.studentCount}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="role-bar">
        <span className="rb-label">Vous êtes…</span>
        <div className="rb-chips">
          <span className="rb-chip active"><span className="rb-ic"><Icon name="book" /></span> Élève</span>
          <button className="rb-chip" onClick={() => onStaff("teacher")}><span className="rb-ic"><Icon name="users" /></span> Enseignant</button>
          <button className="rb-chip" onClick={() => onStaff("admin")}><span className="rb-ic"><Icon name="settings" /></span> Administrateur</button>
        </div>
      </div>
      <a className="register-link" href="/register/?role=student">Nouveau ? Rejoignez avec un code de classe <Icon name="arrowR" /></a>
    </>
  );
}

/* ---- Step 2: student ---- */
function StudentStep({ cls, onBack, onPick }) {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase();
  const list = cls.students.filter((s) => fullName(s).toLowerCase().includes(q));
  return (
    <>
      <button className="back-link" onClick={onBack}><Icon name="chevL" /> {cls.name}</button>
      <div className="step-head">
        <div className="step-eyebrow">Étape 2 sur 3 <StepDots n={2} /></div>
        <h2>Qui se connecte ?</h2>
        <p>Touchez votre nom pour continuer.</p>
      </div>
      <div className="stu-search">
        <Icon name="user" />
        <input
          className="input"
          placeholder="Cherchez votre nom…"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="stu-grid">
        {list.map((s) => (
          <button key={s.id} className="stu-card" onClick={() => onPick(s)}>
            <Avatar name={fullName(s)} size="avatar-lg" />
            <span className="nm">{s.firstName}<br />{s.lastName || ""}</span>
          </button>
        ))}
        {list.length === 0 && <div className="muted" style={{ padding: "12px 4px" }}>Aucune correspondance.</div>}
      </div>
    </>
  );
}

/* ---- Step 3: PIN ---- */
function PinStep({ cls, student, onBack }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const timers = useRef([]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  async function validate(value) {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/student-login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: cls.id, studentId: student.id, pin: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setOk(true);
        const t = setTimeout(() => { window.location.href = data.redirect || "/student/"; }, 450);
        timers.current.push(t);
        return;
      }
      // failure
      setShake(true);
      if (data.error === "LOCKED") setErr("Trop d’essais — verrouillé pendant 5 min.");
      else if (typeof data.remaining === "number") setErr(`Code PIN incorrect. ${data.remaining} essai(s) restant(s).`);
      else setErr("Code PIN incorrect. Réessayez.");
      const t = setTimeout(() => { setShake(false); setPin(""); }, 450);
      timers.current.push(t);
    } catch {
      setShake(true);
      setErr("Problème de connexion. Réessayez.");
      const t = setTimeout(() => { setShake(false); setPin(""); }, 450);
      timers.current.push(t);
    } finally {
      setBusy(false);
    }
  }

  function press(d) {
    if (busy || ok) return;
    setErr("");
    if (d === "back") { setPin((p) => p.slice(0, -1)); return; }
    if (d === "clear") { setPin(""); return; }
    setPin((p) => {
      if (p.length >= 4) return p;
      const next = p + d;
      if (next.length === 4) {
        const t = setTimeout(() => validate(next), 180);
        timers.current.push(t);
      }
      return next;
    });
  }

  if (ok) {
    return (
      <>
        <button className="back-link" onClick={onBack}><Icon name="chevL" /> {cls.name}</button>
        <div className="pin-stage">
          <div className="pin-ok">
            <div className="ok-ring"><Icon name="check" /></div>
            <h2>Bienvenue, {student.firstName} !</h2>
            <p className="muted">Chargement de votre parcours d’apprentissage…</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <button className="back-link" onClick={onBack}><Icon name="chevL" /> {cls.name}</button>
      <div className="pin-stage">
        <div className="pin-who">
          <Avatar name={fullName(student)} size="avatar-xl" />
          <div className="nm">{fullName(student)}</div>
          <p className="muted" style={{ fontSize: "14px" }}>Saisissez votre code PIN à 4 chiffres</p>
        </div>
        <div className={`pin-dots${shake ? " shake" : ""}`}>
          {[0, 1, 2, 3].map((idx) => (
            <i key={idx} className={idx < pin.length ? "filled" : ""} />
          ))}
        </div>
        <div className="pin-err">{err}</div>
        <div className="pin-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} className="pin-key" onClick={() => press(String(d))}>{d}</button>
          ))}
          <button className="pin-key fn" title="Effacer" onClick={() => press("clear")}><Icon name="x" /></button>
          <button className="pin-key" onClick={() => press("0")}>0</button>
          <button className="pin-key fn" onClick={() => press("back")}><Icon name="backspace" /></button>
        </div>
        <a className="pin-hint forgot-link" href="/login/forgot/">Code PIN oublié ?</a>
      </div>
    </>
  );
}

/* ---- Staff modal ---- */
const STAFF_ROLES = {
  teacher: {
    icon: "users",
    kicker: "Espace enseignant",
    title: "Bon retour, professeur.",
    sub: "Vos classes, votre studio et le tuteur Copilot.",
    placeholder: "prenom.nom@mwalimu.school",
    cta: "Entrer dans mon espace",
    foot: "Les comptes enseignants sont créés par l’administrateur.",
  },
  admin: {
    icon: "settings",
    kicker: "Espace administrateur",
    title: "Console d’administration.",
    sub: "Comptes, classes, contenu et accès de l’école.",
    placeholder: "admin@mwalimu.school",
    cta: "Accéder à la console",
    foot: "Accès réservé à l’administration de l’école.",
  },
};

function StaffModal({ role = "teacher", onClose }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const emailRef = useRef(null);
  const pwRef = useRef(null);
  const cfg = STAFF_ROLES[role] || STAFF_ROLES.teacher;

  async function signIn() {
    if (busy) return;
    // Read from the DOM, not just React state: Safari autofill fills the inputs
    // without firing onChange, so on the first click the state can still be empty.
    const emailVal = (emailRef.current?.value ?? email).trim().toLowerCase();
    const passwordVal = pwRef.current?.value ?? password;
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/staff-login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailVal, password: passwordVal }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.location.href = data.redirect || "/teacher/";
        return;
      }
      if (data.error === "LOCKED") setErr("Trop d’essais — verrouillé pendant 5 min.");
      else if (data.error === "DEACTIVATED") setErr("Ce compte a été désactivé. Contactez votre administrateur.");
      else setErr("E-mail ou mot de passe incorrect.");
    } catch {
      setErr("Problème de connexion. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal staff-modal staff-${role}`}>
        <button className="icon-x staff-x" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        <div className="staff-hero">
          <span className="staff-badge"><Icon name={cfg.icon} /></span>
          <div className="staff-hero-txt">
            <div className="staff-kicker">
              {cfg.kicker}
              {role === "admin" && <span className="secure-chip"><Icon name="lock" /> Accès sécurisé</span>}
            </div>
            <h2>{cfg.title}</h2>
            <p>{cfg.sub}</p>
          </div>
        </div>

        <form className="staff-body" onSubmit={(e) => { e.preventDefault(); signIn(); }}>
          <div className="staff-fields">
            <div className="field">
              <label>E-mail</label>
              <div className="input-ic">
                <Icon name="user" />
                <input
                  ref={emailRef}
                  className="input"
                  type="email"
                  placeholder={cfg.placeholder}
                  value={email}
                  autoComplete="username"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>Mot de passe</label>
              <div className="input-ic">
                <Icon name="lock" />
                <input
                  ref={pwRef}
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          {err ? (
            <div className="demo-note" style={{ color: "var(--danger-fg)" }}>
              <Icon name="alert" /> {err}
            </div>
          ) : null}

          <button
            type="submit"
            className="btn btn-block btn-lg staff-cta"
            style={{ marginTop: "16px" }}
            disabled={busy}
          >
            {busy ? "Connexion…" : <>{cfg.cta} <Icon name="arrowR" /></>}
          </button>

          <div className="staff-foot">
            <span className="muted">{cfg.foot}</span>
            <a href="/login/forgot/?role=staff">Mot de passe oublié ?</a>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [lang, setLang] = useState("fr");
  const [step, setStep] = useState(1);
  const [cls, setCls] = useState(null);
  const [student, setStudent] = useState(null);
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffRole, setStaffRole] = useState("teacher");
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/classes/")
      .then((r) => r.json())
      .then((d) => { if (alive) setClasses(d.classes || []); })
      .catch(() => { if (alive) toast("Impossible de charger les classes — le serveur est-il démarré ?", { icon: "alert" }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const showTopPill = step > 1;

  function pickLang(l) {
    setLang(l);
    if (l === "en") {
      toast("L’anglais arrive bientôt.", { icon: "info" });
    }
  }

  return (
    <div className="login-page">
      <div className="login-root" data-layout="split">
        {/* Brand panel */}
        <aside className="brand-panel">
          <span className="bp-orb bp-orb-a" aria-hidden="true" />
          <span className="bp-orb bp-orb-b" aria-hidden="true" />
          <div className="bp-logo"><BrandMark /> Mwalimu</div>
          <div className="bp-mid">
            <div className="bp-eyebrow">Bienvenue <span className="wave">👋</span></div>
            <h1>Apprenez sans limites, même hors ligne.</h1>
            <p className="tag">La plateforme d’apprentissage de votre école — leçons, quiz et un tuteur IA, fonctionnant entièrement sur le serveur local.</p>
            <ul className="bp-features">
              <li><span className="fic"><Icon name="home" /></span> Entièrement hors ligne sur le serveur de votre école</li>
              <li><span className="fic"><Icon name="sparkles" /></span> Tuteur IA Copilot dans chaque leçon</li>
              <li><span className="fic"><Icon name="target" /></span> Un parcours d’apprentissage personnel pour chaque élève</li>
            </ul>
          </div>
          <div className="bp-foot">
            <span className="offline-pill"><span className="dot" /> Serveur local connecté</span>
            <span className="ver">Mwalimu v1.0 · LAN</span>
          </div>
        </aside>

        {/* Content side */}
        <section className="content-side">
          <div className="content-top">
            <div className="mini-brand"><BrandMark /> Mwalimu</div>
            <div className="row" style={{ gap: "12px" }}>
              {showTopPill && (
                <span className="offline-pill"><span className="dot" /> Serveur local connecté</span>
              )}
              <div className="lang-toggle">
                <button className={lang === "fr" ? "active" : ""} onClick={() => pickLang("fr")}>FR</button>
                <button className={lang === "en" ? "active" : ""} onClick={() => pickLang("en")}>EN</button>
              </div>
            </div>
          </div>

          <div className="content-stage">
            <div className="step-card">
              {step === 1 && (
                <ClassStep
                  classes={classes}
                  loading={loading}
                  onPick={(c) => { setCls(c); setStep(2); }}
                  onStaff={(role) => { setStaffRole(role); setStaffOpen(true); }}
                />
              )}
              {step === 2 && cls && (
                <StudentStep
                  cls={cls}
                  onBack={() => setStep(1)}
                  onPick={(s) => { setStudent(s); setStep(3); }}
                />
              )}
              {step === 3 && cls && student && (
                <PinStep
                  cls={cls}
                  student={student}
                  onBack={() => setStep(2)}
                />
              )}
            </div>
          </div>
        </section>
      </div>

      {staffOpen && <StaffModal role={staffRole} onClose={() => setStaffOpen(false)} />}
    </div>
  );
}
