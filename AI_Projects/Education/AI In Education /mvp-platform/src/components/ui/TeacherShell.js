"use client";
import { useState, useEffect } from "react";
import Icon from "./Icon";
import { BrandMark, OfflinePill, LangToggle, Avatar } from "./chrome";
import { toast } from "@/lib/toast";

// Canonical teacher app shell — sidebar nav + sticky topbar. New teacher pages
// render through this so the nav, badges and account footer stay consistent.
// Badge counts (projects to grade, open feedback) come from /api/teacher/badges.
const NAV = [
  { href: "/teacher/", icon: "grid", label: "Tableau de bord" },
  { href: "/teacher/class/", icon: "users", label: "Mes classes" },
  { href: "/teacher/feedback/", icon: "message", label: "Retours", badge: "openFeedback" },
  { href: "/teacher/insights/", icon: "sparkles", label: "Analyses Copilot" },
  { href: "/teacher/studio/", icon: "edit", label: "Studio de contenu" },
  { href: "/teacher/studio/rediger/", icon: "file", label: "Rédiger une leçon" },
  // Atelier LaTeX is deliberately NOT here. It is a tool for the lesson you are writing,
  // and from the sidebar it opened on nothing — a blank workspace and a picker. It is
  // reached from « Rédiger une leçon » instead (toolbar → Atelier LaTeX), which hands it
  // the open lesson. The /teacher/studio/latex/ route is still live: bookmarks work.
  { href: "/teacher/exercises/", icon: "book", label: "Exercices" },
  { href: "/teacher/projects/", icon: "layers", label: "Projets", badge: "toCorrect" },
  // Shared reference tool — the same page students open, so a teacher can
  // project it in class and drill the exact specimen the class will revise on.
  { href: "/anatomie/", icon: "svt", label: "Anatomie 3D" },
];

// Shared loader so every teacher page shows the same live badge counts.
export function useTeacherBadges() {
  const [badges, setBadges] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/teacher/badges/")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setBadges(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return badges;
}

export default function TeacherShell({ active = "", crumbGroup = "Enseignement", crumbPage = "", teacher = {}, right, children }) {
  const [collapsed, setCollapsed] = useState(false);
  // On phones the sidebar is an off-canvas drawer — start it closed so content
  // gets the full width; the burger opens it.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 860) setCollapsed(true);
  }, []);
  const badges = useTeacherBadges();

  const fromBadge = badges?.teacher || {};
  const teacherName = `${teacher.firstName || fromBadge.firstName || ""} ${teacher.lastName || fromBadge.lastName || ""}`.trim();
  // The API agrees « Mme »/« M. » and « Enseignante »/« Enseignant » with User.gender —
  // never re-derive it here, that divergence is the bug this replaced.
  const displayName = fromBadge.displayName || teacherName;
  const role = teacher.role || (fromBadge.discipline ? `${fromBadge.roleLabel} · ${fromBadge.discipline}` : fromBadge.roleLabel || "");
  const taughtSubjects = fromBadge.subjects || [];
  const openFeedback = badges?.openFeedback || 0;

  return (
    <div className={`t-app teacher-page ${collapsed ? "collapsed" : ""}`.trim()}>
      <aside className="t-side">
        <div className="t-side-top">
          <BrandMark />
          <span className="nm">Mwalimu</span>
        </div>
        <nav className="t-nav">
          <span className="grouplabel">Enseignement</span>
          {NAV.map((n) => {
            const count = n.badge && badges ? badges[n.badge] : 0;
            return (
              <a key={n.href} href={n.href} className={active === n.href ? "active" : ""}>
                <Icon name={n.icon} />
                <span className="lbl">{n.label}</span>
                {count > 0 ? <span className="pill">{count}</span> : null}
              </a>
            );
          })}
          <span className="grouplabel">Compte</span>
          <a href="/profile/">
            <Icon name="settings" />
            <span className="lbl">Paramètres</span>
          </a>
        </nav>
        <div className="t-side-foot">
          <div className="t-userbox">
            {/* The bare name, not displayName — initials come from Grâce/Mukendi, and a
                seeded stand-in name here would be wrong for every other teacher. */}
            <Avatar name={teacherName} size="avatar-sm" />
            <a className="meta" href="/profile/" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="un">{displayName}</div>
              <div className="ur" title={taughtSubjects.join("\n")}>{role}</div>
            </a>
            <a className="lo" href="/api/auth/logout/" title="Se déconnecter">
              <Icon name="logout" />
            </a>
          </div>
        </div>
      </aside>

      <div className="t-main">
        <header className="t-top">
          <div className="t-top-left">
            <button className="t-burger" onClick={() => setCollapsed((c) => !c)} aria-label="Réduire le menu">
              <Icon name="grid" />
            </button>
            <div className="t-crumb">
              {crumbGroup}
              <b>{crumbPage}</b>
            </div>
          </div>
          <div className="t-top-right">
            {right ?? (
              <>
                <OfflinePill label="Serveur local connecté" />
                <LangToggle onNotice={() => toast("Le français complet arrive — interface en anglais pour cette revue.", { icon: "info" })} />
                <a
                  className="t-iconbtn"
                  href="/teacher/"
                  title={openFeedback > 0 ? `${openFeedback} retour(s) d'élèves à traiter` : "Aucune nouvelle alerte"}
                  aria-label="Notifications"
                >
                  <Icon name="bell" />
                  {openFeedback > 0 ? <span className="dot-badge" /> : null}
                </a>
              </>
            )}
          </div>
        </header>
        <div className="t-content">{children}</div>
      </div>
      {/* Tap-to-close scrim for the mobile drawer (visible only when open on phones). */}
      <div className="t-scrim" onClick={() => setCollapsed(true)} aria-hidden="true" />
    </div>
  );
}
