"use client";
import { useEffect, useState } from "react";
import "./profile.css";
import Icon from "@/components/ui/Icon";
import { BrandMark, Avatar } from "@/components/ui/chrome";
import { toast } from "@/lib/toast";
import { roleLabel, withCivility } from "@/lib/gender";

const COLORS = ["#4f46e5", "#0d9488", "#ea580c", "#16a34a", "#7c3aed", "#2563eb", "#db2777", "#d97706", "#0891b2", "#65a30d"];
const homeFor = (role) => (role === "ADMIN" ? "/admin/" : role === "TEACHER" ? "/teacher/" : "/student/");
// null last, and spelled out: « ne pas préciser » is a choice, not the absence of one.
const CIVILITIES = [
  { value: "F", label: "Mme" },
  { value: "M", label: "M." },
  { value: null, label: "Ne pas préciser" },
];

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [teaching, setTeaching] = useState(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", locale: "fr", avatarColor: COLORS[0], gender: null });
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
          setTeaching(d.teaching || null);
          setForm({
            firstName: d.user.firstName || "",
            lastName: d.user.lastName || "",
            locale: d.user.locale || "fr",
            avatarColor: d.user.avatarColor || COLORS[0],
            gender: d.user.gender ?? null,
          });
        }
      })
      .catch(() => {});
  }, []);

  const isStudent = user?.role === "STUDENT";
  // Teachers cannot change their own password — it is set and reset by the
  // administrator. Students manage their PIN and admins their own password.
  const canChangeCredential = user?.role !== "TEACHER";

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
    return (
      <div className="profile-page">
        <div className="profile-in profile-body"><p className="pf-loading">Chargement…</p></div>
      </div>
    );
  }

  const isStaff = user.role === "TEACHER" || user.role === "ADMIN";
  // Nothing to save until something changed — the button used to invite a no-op PATCH
  // and answer it with « Profil enregistré ».
  const dirty =
    form.firstName !== (user.firstName || "") ||
    form.lastName !== (user.lastName || "") ||
    form.locale !== (user.locale || "fr") ||
    form.avatarColor !== (user.avatarColor || COLORS[0]) ||
    form.gender !== (user.gender ?? null);

  const name = `${form.firstName} ${form.lastName}`.trim();
  const onlyDigits = (v) => v.replace(/\D/g, "").slice(0, 4);
  // Distinct books, not the sum per class — one book is usually taught to several.
  const subjectCount = teaching
    ? new Set(teaching.classes.flatMap((c) => c.subjects)).size
    : 0;

  return (
    // The teacher/admin warm-paper palette follows the person, not the URL. Without it
    // /profile was the one page a teacher could reach that was still cool slate.
    <div className={`profile-page${isStaff ? " teacher-page" : ""}`}>
      <div className="profile-top">
        <a className="back-link" href={homeFor(user.role)}><Icon name="chevL" /> Retour</a>
        <div className="mini-brand"><BrandMark /> Mwalimu</div>
        <a className="logout-link" href="/api/auth/logout/"><Icon name="logout" /> Se déconnecter</a>
      </div>

      {/* Identity band, then the settings on the desk below — the same two-zone shape as
          « Rédiger une leçon », so the two full-page surfaces read as one product. */}
      <div className="profile-band">
        <div className="profile-in">
          <header className="profile-hero">
            <span className="avatar avatar-xl" style={{ background: form.avatarColor }}>
              {(form.firstName[0] || "") + (form.lastName[0] || "")}
            </span>
            <div className="ph-id">
              {/* Both agree with the same field, and both follow the picker live. */}
              <h1>{name ? withCivility(form.gender, name) : "Votre profil"}</h1>
              <div className="ph-meta">
                <span className="ph-role">{roleLabel(user.role, form.gender)}</span>
                {user.email && <span className="ph-mail">{user.email}</span>}
              </div>
            </div>
          </header>
        </div>
      </div>

      <div className="profile-in profile-body">
        <section className="profile-card">
          <div className="pf-head"><h2>Profil</h2></div>
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
          {/* Staff only. « Élève » is invariable and no student-facing surface uses a
              civility, so for a pupil this control would change nothing on screen. */}
          {isStaff && (
            <div className="field">
              <label>Civilité</label>
              <div className="seg">
                {CIVILITIES.map((c) => (
                  <button
                    key={c.value ?? "none"}
                    className={form.gender === c.value ? "active" : ""}
                    onClick={() => setForm((f) => ({ ...f, gender: c.value }))}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="pf-hint">
                Sert uniquement à l’accord en français : « {roleLabel(user.role, form.gender)} »
                {form.lastName ? `, « ${withCivility(form.gender, form.lastName)} »` : ""}.
              </p>
            </div>
          )}
          <div className="field">
            <label>Couleur de l’avatar</label>
            <div className="swatches">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${form.avatarColor === c ? "on" : ""}`.trim()}
                  style={{ background: c }}
                  onClick={() => setForm((f) => ({ ...f, avatarColor: c }))}
                  aria-label={`Couleur ${c}`}
                  aria-pressed={form.avatarColor === c}
                >
                  {form.avatarColor === c && <Icon name="check" />}
                </button>
              ))}
            </div>
            <p className="pf-hint">L’aperçu en haut de page suit votre choix.</p>
          </div>
          <div className="field">
            <label>Langue</label>
            <div className="seg">
              <button className={form.locale === "fr" ? "active" : ""} onClick={() => setForm((f) => ({ ...f, locale: "fr" }))}>Français</button>
              {/* Disabled, deliberately: `locale` is stored and round-tripped but NOTHING
                  reads it — there is no i18n layer, so choosing English changed the
                  database and not one word on screen. A control that lies is worse than
                  one that waits. */}
              <button className="soon" disabled title="L’interface n’est pas encore traduite">English</button>
            </div>
          </div>
          <div className="pf-actions">
            <button className="btn btn-primary" onClick={saveProfile} disabled={saving || !dirty}>
              {saving ? "Enregistrement…" : "Enregistrer les modifications"}
            </button>
            {dirty && !saving && <span className="pf-unsaved">Modifications non enregistrées</span>}
          </div>
        </section>

        {teaching && teaching.classes.length > 0 && (
          <section className="profile-card">
            <div className="pf-head">
              <h2>Enseignement</h2>
              <span className="pf-teach-sum">
                {teaching.classes.length} classe{teaching.classes.length > 1 ? "s" : ""} · {subjectCount} matière{subjectCount > 1 ? "s" : ""}
              </span>
            </div>
            <ul className="pf-teach">
              {teaching.classes.map((c) => (
                <li key={c.name}>
                  <div className="pf-teach-c">
                    <span className="pf-teach-n">{c.name}</span>
                    {/* The titulaire owns the class as a whole, not just their own
                        subject in it — worth saying, and said nowhere else. */}
                    {c.isLead && <span className="pf-lead">Titulaire</span>}
                  </div>
                  <div className="pf-teach-s">
                    {c.subjects.map((s) => (
                      <span className="pf-chip" key={s}>{s}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <p className="pf-hint">Vos affectations sont définies par l’administration.</p>
          </section>
        )}

        {canChangeCredential && (
        <section className="profile-card">
          <div className="pf-head">
            <h2>Sécurité</h2>
            <span className="pf-teach-sum">{isStudent ? "Code PIN à 4 chiffres" : "8 caractères minimum"}</span>
          </div>
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
          <div className="pf-actions">
            <button className="btn btn-primary" onClick={saveCredential} disabled={credBusy || !cur || !nx || !confirm}>
              {credBusy ? "Mise à jour…" : isStudent ? "Mettre à jour le code PIN" : "Mettre à jour le mot de passe"}
            </button>
          </div>
        </section>
        )}

        {/* A teacher has no credential form, so this used to float below the last card as
            a loose sentence. It is the Sécurité section for them — give it the section. */}
        {user.role === "TEACHER" && (
          <section className="profile-card">
            <div className="pf-head"><h2>Sécurité</h2></div>
            <p className="pf-note">
              <Icon name="lock" />
              <span>Votre mot de passe est géré par l’administrateur. Contactez-le pour le réinitialiser.</span>
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
