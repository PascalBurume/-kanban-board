"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { BrandMark, Avatar } from "@/components/ui/chrome";
import { roleLabel, withCivility } from "@/lib/gender";

// The admin's own identity. Both sidebar lines were the literal string "Super
// administrateur" — the account name and its role, printed twice, neither of them read
// from the session. The teacher shells have always fetched theirs; this one didn't.
function useAdminIdentity() {
  const [me, setMe] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/me/profile/")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.user) setMe(d.user); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return me;
}

// Single source of truth for the admin console's tabs — used by the console's
// own sidebar AND anywhere else an admin works (e.g. the content Studio), so an
// admin always sees the admin navigation and never drops into the teacher shell.
export const ADMIN_TABS = [
  { tab: "overview", ic: "grid", lbl: "Vue d’ensemble" },
  { tab: "approvals", ic: "check", lbl: "Approbations" },
  { tab: "assign", ic: "layers", lbl: "Affectations" },
  { tab: "supervisors", ic: "user", lbl: "Titulaires" },
  { tab: "teachers", ic: "users", lbl: "Enseignants" },
  { tab: "pedagogy", ic: "trend", lbl: "Pédagogie" },
  { tab: "content", ic: "book", lbl: "Contenu" },
  { tab: "offerings", ic: "layers", lbl: "Liaisons" },
  { tab: "classes", ic: "folder", lbl: "Classes" },
  { tab: "students", ic: "users", lbl: "Élèves" },
  { tab: "system", ic: "server", lbl: "État du système" },
  { tab: "audit", ic: "history", lbl: "Journal d’audit" },
];

// Shared admin sidebar (aside + nav + footer).
// - In the console, pass `onSelect` for instant client-side tab switching.
// - Elsewhere (the Studio), omit `onSelect`: each item deep-links to
//   /admin?tab=… so the admin lands back on the right admin tab.
// `active` is a tab key, or "studio" when the content Studio is open.
export default function AdminSidebar({ active, onSelect, pendingCount = 0 }) {
  const me = useAdminIdentity();
  // Not "Administrateur" while loading — that is the role line, and repeating it is the
  // bug being fixed. A neutral placeholder holds the row until the session answers.
  const name = `${me?.firstName || ""} ${me?.lastName || ""}`.trim() || "Compte administrateur";

  return (
    <aside className="t-side">
      <div className="t-side-top">
        <BrandMark />
        <span className="nm">Mwalimu</span>
      </div>
      <nav className="t-nav">
        <span className="grouplabel">Administration</span>
        {ADMIN_TABS.map((n) => (
          <a
            key={n.tab}
            href={`/admin?tab=${n.tab}`}
            className={active === n.tab ? "active" : ""}
            onClick={onSelect ? (e) => { e.preventDefault(); onSelect(n.tab); } : undefined}
          >
            <Icon name={n.ic} />
            <span className="lbl">{n.lbl}</span>
            {n.tab === "approvals" && pendingCount > 0 ? <span className="nav-badge">{pendingCount}</span> : null}
          </a>
        ))}
        <span className="grouplabel">Contenu</span>
        <a
          href="/teacher/studio/"
          className={active === "studio" ? "active" : ""}
          title="Éditer les leçons (réservé à l’administration)"
        >
          <Icon name="edit" />
          <span className="lbl">Studio contenu</span>
        </a>
      </nav>
      <div className="t-side-foot">
        <div className="t-userbox">
          <Avatar name={name} size="avatar-sm" />
          <a className="meta" href="/profile/" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="un">{withCivility(me?.gender, name)}</div>
            {/* Which admin account this is — the email — is the tooltip, matching how the
                teacher footer keeps its book list out of the line and in the title. */}
            <div className="ur" title={me?.email || ""}>{roleLabel("ADMIN", me?.gender)}</div>
          </a>
          <a className="lo" href="/api/auth/logout/" title="Se déconnecter">
            <Icon name="logout" />
          </a>
        </div>
      </div>
    </aside>
  );
}
