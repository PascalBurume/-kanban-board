"use client";
import Icon from "@/components/ui/Icon";
import { BrandMark, Avatar } from "@/components/ui/chrome";

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
          <Avatar name="Super administrateur" size="avatar-sm" />
          <a className="meta" href="/profile/" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="un">Super administrateur</div>
            <div className="ur">Super administrateur</div>
          </a>
          <a className="lo" href="/api/auth/logout/" title="Se déconnecter">
            <Icon name="logout" />
          </a>
        </div>
      </div>
    </aside>
  );
}
