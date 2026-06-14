"use client";
import { useEffect, useState } from "react";
import "./profile.css";
import Icon from "@/components/ui/Icon";
import { BrandMark, Avatar } from "@/components/ui/chrome";
import { toast } from "@/lib/toast";

const COLORS = ["#4f46e5", "#0d9488", "#ea580c", "#16a34a", "#7c3aed", "#2563eb", "#db2777", "#d97706", "#0891b2", "#65a30d"];
const ROLE_LABEL = { STUDENT: "Élève", TEACHER: "Enseignant", ADMIN: "Administrateur" };
const homeFor = (role) => (role === "ADMIN" ? "/admin/" : role === "TEACHER" ? "/teacher/" : "/student/");

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", locale: "fr", avatarColor: COLORS[0] });
  const [saving, setSaving] = useState(false);

  // Credential change
  const [cur, setCur] = useState("");
  const [nx, setNx] = useState("");
  const [confirm, setConfirm] = useState("");
  const [credBusy, setCredBusy] = useState(false);

  useEffect(() => {
    fetch("/api/me/profile/")
      .then(async (r) => {
        if (r.status === 401) { window.location.href = "/login/"; return null; }
        return r.json();
      })
      .then((d) => {
        if (d?.user) {
          setUser(d.user);
          setForm({
            firstName: d.user.firstName || "",
            lastName: d.user.lastName || "",
            locale: d.user.locale || "fr",
            avatarColor: d.user.avatarColor || COLORS[0],
          });
        }
      })
      .catch(() => {});
  }, []);

  const isStudent = user?.role === "STUDENT";

  async function saveProfile() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/me/profile/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        toast("Profil enregistré", { icon: "check" });
        setUser((u) => ({ ...u, ...form }));
      } else {
        toast("Impossible d’enregistrer le profil", { icon: "alert" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveCredential() {
    if (credBusy) return;
    if (isStudent && !/^\d{4}$/.test(nx)) { toast("Le code PIN doit comporter 4 chiffres", { icon: "alert" }); return; }
    if (!isStudent && nx.length < 8) { toast("Le mot de passe doit comporter au moins 8 caractères", { icon: "alert" }); return; }
    if (nx !== confirm) { toast("Les nouvelles saisies ne correspondent pas", { icon: "alert" }); return; }
    setCredBusy(true);
    try {
      const url = isStudent ? "/api/me/pin/" : "/api/me/password/";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: cur, next: nx }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        toast(isStudent ? "Code PIN mis à jour" : "Mot de passe mis à jour", { icon: "check" });
        setCur(""); setNx(""); setConfirm("");
      } else if (d.error === "WRONG_CURRENT") {
        toast(isStudent ? "Le code PIN actuel est incorrect" : "Le mot de passe actuel est incorrect", { icon: "alert" });
      } else {
        toast("Impossible de mettre à jour", { icon: "alert" });
      }
    } finally {
      setCredBusy(false);
    }
  }

  if (!user) {
    return <div className="profile-page"><div className="profile-card"><p className="muted">Chargement…</p></div></div>;
  }

  const name = `${form.firstName} ${form.lastName}`.trim();
  const onlyDigits = (v) => v.replace(/\D/g, "").slice(0, 4);

  return (
    <div className="profile-page">
      <div className="profile-top">
        <a className="back-link" href={homeFor(user.role)}><Icon name="chevL" /> Retour</a>
        <div className="mini-brand"><BrandMark /> Mwalimu</div>
        <a className="back-link" href="/api/auth/logout/">Se déconnecter <Icon name="logout" /></a>
      </div>

      <div className="profile-wrap">
        <header className="profile-hero">
          <span className="avatar avatar-xl" style={{ background: form.avatarColor }}>
            {(form.firstName[0] || "") + (form.lastName[0] || "")}
          </span>
          <div>
            <h1>{name || "Votre profil"}</h1>
            <div className="role-pill">{ROLE_LABEL[user.role]}{user.email ? ` · ${user.email}` : ""}</div>
          </div>
        </header>

        <section className="profile-card">
          <h2>Profil</h2>
          <div className="pf-grid">
            <div className="field">
              <label>Prénom</label>
              <input className="input" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
            </div>
            <div className="field">
              <label>Nom</label>
              <input className="input" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            </div>
          </div>
          <div className="field">
            <label>Langue</label>
            <div className="seg">
              <button className={form.locale === "fr" ? "active" : ""} onClick={() => setForm((f) => ({ ...f, locale: "fr" }))}>Français</button>
              <button className={form.locale === "en" ? "active" : ""} onClick={() => setForm((f) => ({ ...f, locale: "en" }))}>English</button>
            </div>
          </div>
          <div className="field">
            <label>Couleur de l’avatar</label>
            <div className="swatches">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${form.avatarColor === c ? "on" : ""}`.trim()}
                  style={{ background: c }}
                  onClick={() => setForm((f) => ({ ...f, avatarColor: c }))}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
        </section>

        <section className="profile-card">
          <h2>{isStudent ? "Changer votre code PIN" : "Changer votre mot de passe"}</h2>
          <div className="field">
            <label>{isStudent ? "Code PIN actuel" : "Mot de passe actuel"}</label>
            <input
              className="input"
              type="password"
              inputMode={isStudent ? "numeric" : undefined}
              value={cur}
              onChange={(e) => setCur(isStudent ? onlyDigits(e.target.value) : e.target.value)}
            />
          </div>
          <div className="pf-grid">
            <div className="field">
              <label>{isStudent ? "Nouveau code PIN" : "Nouveau mot de passe"}</label>
              <input
                className="input"
                type="password"
                inputMode={isStudent ? "numeric" : undefined}
                value={nx}
                onChange={(e) => setNx(isStudent ? onlyDigits(e.target.value) : e.target.value)}
              />
            </div>
            <div className="field">
              <label>Confirmer</label>
              <input
                className="input"
                type="password"
                inputMode={isStudent ? "numeric" : undefined}
                value={confirm}
                onChange={(e) => setConfirm(isStudent ? onlyDigits(e.target.value) : e.target.value)}
              />
            </div>
          </div>
          <button className="btn btn-primary" onClick={saveCredential} disabled={credBusy}>
            {credBusy ? "Mise à jour…" : isStudent ? "Mettre à jour le code PIN" : "Mettre à jour le mot de passe"}
          </button>
        </section>
      </div>
    </div>
  );
}
