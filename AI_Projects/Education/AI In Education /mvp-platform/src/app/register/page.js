"use client";
import { useState } from "react";
import "../login/login.css";
import "./register.css";
import Icon from "@/components/ui/Icon";
import { BrandMark } from "@/components/ui/chrome";

function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

/* ---- Student self-enroll ---- */
function StudentForm() {
  const [f, setF] = useState({ code: "", firstName: "", lastName: "" });
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const digits = (setter) => (e) => setter(e.target.value.replace(/\D/g, "").slice(0, 4));

  async function submit() {
    if (busy) return;
    setErr("");
    if (pin.length !== 4) { setErr("Choisissez un code PIN à 4 chiffres."); return; }
    if (pin !== confirm) { setErr("Les codes PIN ne correspondent pas."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register-student/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.location.href = data.redirect || "/student/";
        return;
      }
      const map = {
        BAD_CODE: "Ce code de classe n’est pas valide. Demandez le bon à votre enseignant.",
        BAD_PIN: "Votre code PIN doit comporter exactement 4 chiffres.",
        MISSING_FIELDS: "Veuillez remplir tous les champs.",
      };
      setErr(map[data.error] || "Impossible de rejoindre. Réessayez.");
    } catch {
      setErr("Problème de connexion. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">Élèves</div>
        <h2>Rejoignez votre classe</h2>
        <p>Saisissez le code de classe que votre enseignant vous a donné, puis choisissez un code PIN à 4 chiffres.</p>
      </div>
      <Field label="Code de classe">
        <input className="input code-input" placeholder="ex. 5MPA-7K2" value={f.code}
          onChange={(e) => setF((s) => ({ ...s, code: e.target.value.toUpperCase() }))} autoComplete="off" />
      </Field>
      <div className="reg-grid">
        <Field label="Prénom">
          <input className="input" value={f.firstName} onChange={set("firstName")} autoComplete="given-name" />
        </Field>
        <Field label="Nom">
          <input className="input" value={f.lastName} onChange={set("lastName")} autoComplete="family-name" />
        </Field>
      </div>
      <div className="reg-grid">
        <Field label="Choisissez un code PIN">
          <input className="input" inputMode="numeric" type="password" value={pin} onChange={digits(setPin)} placeholder="••••" />
        </Field>
        <Field label="Confirmez le code PIN">
          <input className="input" inputMode="numeric" type="password" value={confirm} onChange={digits(setConfirm)} placeholder="••••"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </Field>
      </div>
      {err && <div className="reg-err"><Icon name="alert" /> {err}</div>}
      <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 16 }} onClick={submit} disabled={busy}>
        {busy ? "Adhésion…" : <>Rejoindre la classe <Icon name="arrowR" /></>}
      </button>
      <div className="reg-foot">
        Déjà inscrit ? <a href="/login/">Se connecter</a>
      </div>
    </>
  );
}

// Only students self-enroll; teacher accounts are created by the super admin.
export default function RegisterPage() {
  return (
    <div className="login-page">
      <div className="login-root" data-layout="split">
        <aside className="brand-panel">
          <div className="bp-logo"><BrandMark /> Mwalimu</div>
          <div className="bp-mid">
            <h1>Bienvenue sur la plateforme d’apprentissage de votre école.</h1>
            <p className="tag">Leçons, quiz et un tuteur IA — fonctionnant entièrement sur le serveur local de votre école.</p>
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

        <section className="content-side">
          <div className="content-top">
            <div className="mini-brand"><BrandMark /> Mwalimu</div>
          </div>
          <div className="content-stage">
            <div className="step-card">
              <StudentForm />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
