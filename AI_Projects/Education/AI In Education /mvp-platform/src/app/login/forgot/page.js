"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import "../login.css";
import Icon from "@/components/ui/Icon";
import { BrandMark, Avatar } from "@/components/ui/chrome";

const fullName = (s) => `${s.firstName} ${s.lastName}`.trim();

function StaffForgot() {
  return (
    <div className="step-card">
      <div className="step-head">
        <div className="step-eyebrow">Personnel</div>
        <h2>Mot de passe oublié ?</h2>
        <p>
          Pour des raisons de sécurité, les mots de passe du personnel sont réinitialisés par un
          administrateur. Demandez à l’administrateur de votre école de le réinitialiser depuis la
          console d’administration — vous recevrez un mot de passe temporaire à changer lors de la
          prochaine connexion.
        </p>
      </div>
      <a className="btn btn-primary btn-block btn-lg" href="/login/">Retour à la connexion</a>
    </div>
  );
}

function StudentForgot() {
  const [classes, setClasses] = useState([]);
  const [cls, setCls] = useState(null);
  const [student, setStudent] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/classes/")
      .then((r) => r.json())
      .then((d) => { if (alive) setClasses(d.classes || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function submit(s) {
    setBusy(true);
    try {
      await fetch("/api/auth/forgot/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: s.id }),
      });
      setDone(true);
    } catch {
      setDone(true); // same UX regardless
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="step-card">
        <div className="pin-ok">
          <div className="ok-ring"><Icon name="check" /></div>
          <h2>Demande envoyée</h2>
          <p className="muted">
            Votre enseignant ou administrateur a été averti et réinitialisera votre code PIN.
            Vérifiez auprès de lui, puis reconnectez-vous.
          </p>
          <a className="btn btn-primary btn-block btn-lg" href="/login/">Retour à la connexion</a>
        </div>
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="step-card">
        <div className="step-head">
          <div className="step-eyebrow">Élèves</div>
          <h2>Code PIN oublié ?</h2>
          <p>Choisissez votre classe, puis votre nom. Nous demanderons à votre enseignant de le réinitialiser.</p>
        </div>
        <div className="class-grid">
          {classes.map((c) => (
            <button key={c.id} className="card card-hover class-card" onClick={() => setCls(c)}>
              <div className="cc-top">
                <div>
                  <h3>{c.name}</h3>
                  <div className="niveau">{[c.level, c.field].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="staff-row">
          <a className="staff-link" href="/login/">Retour à la connexion</a>
        </div>
      </div>
    );
  }

  const list = cls.students.filter((s) => fullName(s).toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="step-card">
      <button className="back-link" onClick={() => setCls(null)}><Icon name="chevL" /> {cls.name}</button>
      <div className="step-head">
        <h2>Trouvez votre nom</h2>
        <p>Touchez votre nom pour demander une réinitialisation du code PIN.</p>
      </div>
      <div className="stu-search">
        <Icon name="user" />
        <input className="input" placeholder="Cherchez votre nom…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="stu-grid">
        {list.map((s) => (
          <button key={s.id} className="stu-card" disabled={busy} onClick={() => submit(s)}>
            <Avatar name={fullName(s)} size="avatar-lg" />
            <span className="nm">{s.firstName}<br />{s.lastName || ""}</span>
          </button>
        ))}
        {list.length === 0 && <div className="muted" style={{ padding: "12px 4px" }}>Aucune correspondance.</div>}
      </div>
    </div>
  );
}

function ForgotInner() {
  const params = useSearchParams();
  const staff = params.get("role") === "staff";
  return (
    <div className="login-page">
      <div className="login-root" data-layout="split">
        <aside className="brand-panel">
          <div className="bp-logo"><BrandMark /> Mwalimu</div>
          <div className="bp-mid">
            <h1>Récupération de compte</h1>
            <p className="tag">Nous allons vous ramener à vos leçons.</p>
          </div>
          <div className="bp-foot">
            <span className="offline-pill"><span className="dot" /> Serveur local connecté</span>
            <span className="ver">Mwalimu v1.0 · LAN</span>
          </div>
        </aside>
        <section className="content-side">
          <div className="content-top">
            <div className="mini-brand"><BrandMark /> Mwalimu</div>
          </div>
          <div className="content-stage">
            {staff ? <StaffForgot /> : <StudentForgot />}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ForgotPage() {
  return (
    <Suspense fallback={null}>
      <ForgotInner />
    </Suspense>
  );
}
