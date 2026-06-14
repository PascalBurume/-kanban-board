"use client";
import { useState, useEffect, useCallback } from "react";
import "./admin.css";
import Icon from "@/components/ui/Icon";
import { BrandMark, OfflinePill, Avatar } from "@/components/ui/chrome";
import { avatarColor, initials } from "@/lib/icons";
import { toast } from "@/lib/toast";

const TAB_NAMES = {
  overview: "Vue d’ensemble",
  approvals: "Approbations",
  assign: "Affectations",
  classes: "Classes",
  students: "Élèves",
  system: "État du système",
  audit: "Journal d’audit",
};

const TABS = [
  { tab: "overview", ic: "grid", lbl: "Vue d’ensemble" },
  { tab: "approvals", ic: "check", lbl: "Approbations" },
  { tab: "assign", ic: "layers", lbl: "Affectations" },
  { tab: "classes", ic: "folder", lbl: "Classes" },
  { tab: "students", ic: "users", lbl: "Élèves" },
  { tab: "system", ic: "server", lbl: "État du système" },
  { tab: "audit", ic: "history", lbl: "Journal d’audit" },
];

// Static presentation for KPI cards; values come from the API.
const KPI_DEFS = [
  { key: "teachers", ic: "user", c: "var(--indigo-600)", bg: "var(--indigo-100)", label: "Enseignants" },
  { key: "students", ic: "users", c: "var(--math)", bg: "var(--math-bg)", label: "Élèves" },
  { key: "classes", ic: "folder", c: "var(--sptic)", bg: "var(--sptic-bg)", label: "Classes" },
  { key: "storageGB", ic: "database", c: "var(--warning)", bg: "var(--warning-bg)", label: "Stockage utilisé", suffix: " Go" },
];

// audit action → icon/colour styling for the activity feed.
const ACTION_STYLE = {
  create: { ic: "plus", c: "var(--success)", bg: "var(--success-bg)" },
  reset: { ic: "refresh", c: "var(--warning-fg)", bg: "var(--warning-bg)" },
  pause: { ic: "pause", c: "var(--danger-fg)", bg: "var(--danger-bg)" },
  backup: { ic: "save", c: "var(--indigo-700)", bg: "var(--indigo-100)" },
  import: { ic: "upload", c: "var(--math)", bg: "var(--math-bg)" },
  delete: { ic: "x", c: "var(--danger-fg)", bg: "var(--danger-bg)" },
  default: { ic: "history", c: "var(--sptic)", bg: "var(--sptic-bg)" },
};

const styleForAction = (action) => {
  const a = (action || "").toLowerCase();
  for (const key of Object.keys(ACTION_STYLE)) {
    if (key !== "default" && a.includes(key)) return ACTION_STYLE[key];
  }
  return ACTION_STYLE.default;
};

const stripTitle = (n) => (n || "").replace(/^(M\.|Mme)\s/, "");

// Relative time from an ISO string. Safe to call during render because the
// underlying data always arrives via fetch in useEffect (client-only).
const relTime = (iso) => {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l’instant";
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `il y a ${hr} heure${hr === 1 ? "" : "s"}`;
  const day = Math.round(hr / 24);
  if (day < 7) return `il y a ${day} jour${day === 1 ? "" : "s"}`;
  return new Date(iso).toLocaleDateString();
};

// Shared fetch helper: 403 → login, returns parsed JSON or null.
async function api(url, opts) {
  const r = await fetch(url, opts);
  if (r.status === 403) {
    window.location.href = "/login/";
    return null;
  }
  let body = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  if (!r.ok) {
    const err = new Error((body && body.error) || `HTTP ${r.status}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

// French labels for audit actions/targets (raw codes come from the database).
const ACTION_LABELS = {
  LOGIN: "Connexion", LOGOUT: "Déconnexion", LOGIN_FAIL: "Échec de connexion",
  SEED: "Initialisation", REGISTER: "Inscription", APPROVE: "Approbation",
  REJECT: "Rejet", INVITE_CODE: "Code d’invitation", PIN_RESET: "Réinitialisation du PIN",
  PIN_RESET_REQUEST: "Demande de réinitialisation", PASSWORD_CHANGE: "Changement de mot de passe",
  PIN_CHANGE: "Changement de code PIN", PROFILE_UPDATE: "Mise à jour du profil",
  CLASS_CREATE: "Création de classe", CLASS_UPDATE: "Modification de classe",
  CLASS_DELETE: "Suppression de classe", STUDENT_IMPORT: "Import d’élèves",
  STUDENT_CREATE: "Ajout d’élève", STUDENT_DELETE: "Suppression d’élève",
  ASSIGNMENT_SET: "Affectation", BACKUP: "Sauvegarde",
};
const TARGET_LABELS = {
  staff: "personnel", student: "élève", students: "élèves", teacher: "enseignant",
  class: "classe", system: "système", assignment: "affectation",
};
const actionLabel = (a) => ACTION_LABELS[a] || a;
const targetLabel = (t) => TARGET_LABELS[t] || t;

function AuditRow({ a }) {
  const st = styleForAction(a.action);
  return (
    <div className="audit-row">
      <span className="audit-ic" style={{ background: st.bg, color: st.c }}>
        <Icon name={st.ic} />
      </span>
      <div className="audit-body">
        <div className="at">
          {actionLabel(a.action)}
          {a.targetType ? (
            <>
              {" "}
              <b>{targetLabel(a.targetType)}</b>
            </>
          ) : null}
        </div>
        <div className="am">{relTime(a.createdAt)}</div>
      </div>
      <span className="audit-actor">{a.actorName}</span>
    </div>
  );
}

export default function AdminConsole() {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState("overview");

  // ---- Overview ----
  const [overview, setOverview] = useState(null);

  // ---- Approvals ----
  const [approvals, setApprovals] = useState(null);

  // ---- Assignments ----
  const [assignData, setAssignData] = useState(null);

  // ---- Classes ----
  const [classes, setClasses] = useState([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [clsFilter, setClsFilter] = useState("");

  // ---- Students ----
  const [students, setStudents] = useState([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [stuFilter, setStuFilter] = useState("");
  const [stuClass, setStuClass] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // ---- System health ----
  const [health, setHealth] = useState(null);
  const [usbLabel, setUsbLabel] = useState("Sauvegarder sur USB maintenant");
  const [usbIcon, setUsbIcon] = useState("download");
  const [usbBusy, setUsbBusy] = useState(false);

  // ---- Audit ----
  const [audit, setAudit] = useState([]);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [auditFilter, setAuditFilter] = useState("");

  // ---- Modal (generic: add class / add student / show pin) ----
  const [modal, setModal] = useState(null);

  const showTab = (t) => setTab(t);

  // --- Loaders ---
  const loadOverview = useCallback(() => {
    api("/api/admin/overview/")
      .then((d) => d && setOverview(d))
      .catch(() => {});
  }, []);

  const loadApprovals = useCallback(() => {
    api("/api/admin/approvals/")
      .then((d) => d && setApprovals(d))
      .catch(() => {});
  }, []);

  const loadAssignments = useCallback(() => {
    api("/api/admin/assignments/")
      .then((d) => d && setAssignData(d))
      .catch(() => {});
  }, []);

  const loadClasses = useCallback(() => {
    api("/api/admin/classes/")
      .then((d) => {
        if (d) setClasses(d.classes || []);
      })
      .catch(() => {})
      .finally(() => setClassesLoaded(true));
  }, []);

  const loadStudents = useCallback((cls, q) => {
    const params = new URLSearchParams();
    if (cls) params.set("class", cls);
    if (q) params.set("q", q);
    const qs = params.toString();
    api(`/api/admin/students/${qs ? `?${qs}` : ""}`)
      .then((d) => {
        if (d) setStudents(d.students || []);
      })
      .catch(() => {})
      .finally(() => setStudentsLoaded(true));
  }, []);

  const loadHealth = useCallback(() => {
    api("/api/admin/health/")
      .then((d) => d && setHealth(d))
      .catch(() => {});
  }, []);

  const loadAudit = useCallback((q) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    api(`/api/admin/audit/${qs}`)
      .then((d) => {
        if (d) setAudit(d.entries || []);
      })
      .catch(() => {})
      .finally(() => setAuditLoaded(true));
  }, []);

  // Overview + approvals on mount (approvals drives the sidebar badge).
  useEffect(() => {
    loadOverview();
    loadApprovals();
  }, [loadOverview, loadApprovals]);

  // Lazy-load per tab on first view.
  useEffect(() => {
    if (tab === "approvals") loadApprovals();
    if (tab === "assign" && !assignData) loadAssignments();
    if (tab === "classes" && !classesLoaded) loadClasses();
    if (tab === "students" && !studentsLoaded) loadStudents("", "");
    if (tab === "system" && !health) loadHealth();
    if (tab === "audit" && !auditLoaded) loadAudit("");
  }, [
    tab,
    assignData,
    classesLoaded,
    studentsLoaded,
    health,
    auditLoaded,
    loadApprovals,
    loadAssignments,
    loadClasses,
    loadStudents,
    loadHealth,
    loadAudit,
  ]);

  // --- Approvals: approve/reject pending teachers ---
  const decideTeacher = (t, decision) => {
    api(`/api/admin/users/${t.id}/approve/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    })
      .then((r) => {
        if (r) {
          toast(`${t.name} ${decision === "reject" ? "rejeté(e)" : "approuvé(e)"}`, { icon: decision === "reject" ? "x" : "check" });
          loadApprovals();
          loadOverview();
        }
      })
      .catch(() => toast("Impossible de mettre à jour la demande", { icon: "alert" }));
  };

  // --- Invite codes: generate/regenerate a class self-enrollment code ---
  const genInvite = (c) => {
    api(`/api/admin/classes/${c.id}/invite-code/`, { method: "POST" })
      .then((r) => {
        if (r) {
          setModal({ type: "invite", name: c.name, code: r.inviteCode });
          loadClasses();
        }
      })
      .catch(() => toast("Impossible de générer un code", { icon: "alert" }));
  };

  // --- Assignments: cycle cell none → assigned → lead → none ---
  const cycleCell = (teacher, cls) => {
    if (!assignData) return;
    const key = `${teacher.id}:${cls.id}`;
    const cur = assignData.cells[key] || { assigned: false, lead: false };
    const state = cur.lead ? "none" : cur.assigned ? "lead" : "assigned";
    const next = {
      none: { assigned: false, lead: false },
      assigned: { assigned: true, lead: false },
      lead: { assigned: true, lead: true },
    }[state];
    // Optimistic.
    setAssignData((prev) => ({
      ...prev,
      cells: { ...prev.cells, [key]: { ...(prev.cells[key] || { subjects: [] }), ...next } },
    }));
    api("/api/admin/assignments/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId: teacher.id, classId: cls.id, state }),
    })
      .then((r) => {
        if (r) {
          const verb = state === "none" ? "Affectation retirée :" : state === "lead" ? "Enseignant principal défini :" : "Affecté :";
          toast(`${verb} ${teacher.firstName} ${teacher.lastName} · ${cls.name}`, {
            icon: state === "none" ? "x" : "check",
          });
        }
      })
      .catch(() => {
        toast("Impossible de mettre à jour l’affectation", { icon: "alert" });
        loadAssignments();
      });
  };

  // --- Classes CRUD ---
  const submitAddClass = (name, level, field) => {
    api("/api/admin/classes/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, level, field }),
    })
      .then((r) => {
        if (r) {
          toast(`Classe « ${name} » créée`, { icon: "check" });
          setModal(null);
          loadClasses();
        }
      })
      .catch((e) => {
        if (e.status === 409 || (e.body && e.body.error === "DUPLICATE"))
          toast("Une classe portant ce nom existe déjà", { icon: "alert" });
        else toast("Impossible de créer la classe", { icon: "alert" });
      });
  };

  const submitEditClass = (id, name, level, field) => {
    api(`/api/admin/classes/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, level, field }),
    })
      .then((r) => {
        if (r) {
          toast("Classe mise à jour", { icon: "check" });
          setModal(null);
          loadClasses();
        }
      })
      .catch(() => toast("Impossible de mettre à jour la classe", { icon: "alert" }));
  };

  const deleteClass = (c) => {
    if (!window.confirm(`Supprimer la classe « ${c.name} » ? Cette action est irréversible.`)) return;
    api(`/api/admin/classes/${c.id}/`, { method: "DELETE" })
      .then((r) => {
        if (r) {
          toast(`Classe « ${c.name} » supprimée`, { icon: "check" });
          loadClasses();
        }
      })
      .catch(() => toast("Impossible de supprimer la classe", { icon: "alert" }));
  };

  // --- Students ---
  const submitAddStudent = (firstName, lastName, classId) => {
    api("/api/admin/students/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, classId }),
    })
      .then((r) => {
        if (r) {
          setModal({
            type: "pin",
            title: "Élève ajouté",
            name: `${r.student.firstName} ${r.student.lastName}`,
            pin: r.pin,
          });
          loadStudents(stuClass, stuFilter);
        }
      })
      .catch(() => toast("Impossible d’ajouter l’élève", { icon: "alert" }));
  };

  const resetPin = (s) => {
    api(`/api/admin/students/${s.id}/reset-pin/`, { method: "POST" })
      .then((r) => {
        if (r)
          setModal({
            type: "pin",
            title: "Code PIN réinitialisé",
            name: `${r.student.firstName} ${r.student.lastName}`,
            pin: r.pin,
          });
      })
      .catch(() => toast("Impossible de réinitialiser le code PIN", { icon: "alert" }));
  };

  const toggleStudentActive = (s) => {
    api(`/api/admin/students/${s.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !s.isActive }),
    })
      .then((r) => {
        if (r) {
          toast(`${s.firstName} ${s.lastName} ${s.isActive ? "désactivé(e)" : "réactivé(e)"}`, {
            icon: "check",
          });
          loadStudents(stuClass, stuFilter);
        }
      })
      .catch(() => toast("Impossible de mettre à jour l’élève", { icon: "alert" }));
  };

  const deleteStudent = (s) => {
    if (!window.confirm(`Retirer ${s.firstName} ${s.lastName} ?`)) return;
    api(`/api/admin/students/${s.id}/`, { method: "DELETE" })
      .then((r) => {
        if (r) {
          toast(`${s.firstName} ${s.lastName} retiré(e)`, { icon: "check" });
          loadStudents(stuClass, stuFilter);
        }
      })
      .catch(() => toast("Impossible de retirer l’élève", { icon: "alert" }));
  };

  const importCsv = (csv) => {
    toast("Import des élèves…", { icon: "upload" });
    api("/api/admin/students/import/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    })
      .then((r) => {
        if (r) {
          setImportResult(r);
          toast(`${(r.created || []).length} élèves importés`, { icon: "check" });
          loadStudents(stuClass, stuFilter);
        }
      })
      .catch(() => toast("Échec de l’import", { icon: "alert" }));
  };

  const readAndImport = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importCsv(String(reader.result || ""));
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const csv = "firstName,lastName,class\nAmani,Kabasele,5e Sci. A\nGrâce,Tshibanda,5e Sci. A\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "students_template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("Modèle téléchargé", { icon: "download" });
  };

  // --- System: backup ---
  const runUsbBackup = () => {
    if (usbBusy) return;
    setUsbBusy(true);
    setUsbIcon("refresh");
    setUsbLabel("Sauvegarde en cours…");
    api("/api/admin/backup/", { method: "POST" })
      .then((r) => {
        if (r) {
          setUsbIcon("check");
          setUsbLabel("Sauvegarde terminée");
          toast(`Sauvegarde enregistrée · ${r.file} (${r.sizeMB} Mo)`, { icon: "check" });
          loadHealth();
        } else {
          setUsbIcon("download");
          setUsbLabel("Sauvegarder sur USB maintenant");
        }
      })
      .catch(() => {
        setUsbIcon("download");
        setUsbLabel("Sauvegarder sur USB maintenant");
        toast("Échec de la sauvegarde", { icon: "alert" });
      })
      .finally(() => {
        setUsbBusy(false);
        setTimeout(() => {
          setUsbIcon("download");
          setUsbLabel("Sauvegarder sur USB maintenant");
        }, 2200);
      });
  };

  // --- Derived ---
  const pendingCount = (approvals?.teachers?.length || 0) + (approvals?.pinResets?.length || 0);
  const kpis = overview?.kpis || {};
  const ovHealth = overview?.health || {};
  const recent = overview?.recent || [];

  const clsList = classes.filter((c) => (c.name || "").toLowerCase().includes(clsFilter.toLowerCase()));

  const onStudentSearch = (val) => {
    setStuFilter(val);
    loadStudents(stuClass, val);
  };
  const onStudentClass = (val) => {
    setStuClass(val);
    loadStudents(val, stuFilter);
  };

  const onAuditSearch = (val) => {
    setAuditFilter(val);
    loadAudit(val);
  };

  return (
    <div className={`t-app admin-page ${collapsed ? "collapsed" : ""}`.trim()}>
      <aside className="t-side">
        <div className="t-side-top">
          <BrandMark />
          <span className="nm">Mwalimu</span>
        </div>
        <nav className="t-nav">
          <span className="grouplabel">Administration</span>
          {TABS.map((n) => (
            <a
              key={n.tab}
              href="#"
              className={tab === n.tab ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                showTab(n.tab);
              }}
            >
              <Icon name={n.ic} />
              <span className="lbl">{n.lbl}</span>
              {n.tab === "approvals" && pendingCount > 0 ? (
                <span className="nav-badge">{pendingCount}</span>
              ) : null}
            </a>
          ))}
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

      <div className="t-main">
        <header className="t-top">
          <div className="t-top-left">
            <button className="t-burger" onClick={() => setCollapsed((c) => !c)}>
              <Icon name="grid" />
            </button>
            <div className="t-crumb">
              Administration<b>{TAB_NAMES[tab]}</b>
            </div>
            <span className="admin-badge">Administrateur</span>
          </div>
          <div className="t-top-right">
            <OfflinePill label="Serveur local connecté" />
            <button
              className="t-iconbtn"
              onClick={() => toast("Système en bon état", { icon: "bell" })}
            >
              <Icon name="bell" />
              <span className="dot-badge" />
            </button>
          </div>
        </header>

        <div className="t-content">
          <div className="adm-tabs">
            {TABS.map((t) => (
              <div
                key={t.tab}
                className={`adm-tab ${tab === t.tab ? "active" : ""}`.trim()}
                onClick={() => showTab(t.tab)}
              >
                <Icon name={t.ic} /> {t.lbl}
              </div>
            ))}
          </div>

          {/* OVERVIEW */}
          <div className={`adm-panel ${tab === "overview" ? "active" : ""}`.trim()}>
            <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
              {KPI_DEFS.map((k) => (
                <div className="card kpi" key={k.label}>
                  <div className="kt">
                    <span className="kic" style={{ background: k.bg, color: k.c }}>
                      <Icon name={k.ic} />
                    </span>
                    <span className="klabel">{k.label}</span>
                  </div>
                  <div className="kval">
                    {overview ? `${kpis[k.key] ?? "—"}${k.suffix || ""}` : "…"}
                  </div>
                </div>
              ))}
            </div>
            <div className="health-grid" style={{ marginTop: "24px" }}>
              <div className="card health-card">
                <div className="hh">
                  <span
                    className="hic"
                    style={
                      ovHealth.ollamaOnline
                        ? { background: "var(--success-bg)", color: "var(--success-fg)" }
                        : { background: "var(--danger-bg)", color: "var(--danger-fg)" }
                    }
                  >
                    <Icon name="cpu" />
                  </span>
                  <div>
                    <h3>Tuteur IA (Ollama)</h3>
                    <div className="hs">Moteur d’inférence local</div>
                  </div>
                  <span className="grow" />
                  <span className="status-live">
                    <span className="sdot" />
                    {ovHealth.ollamaOnline ? "En ligne" : "Hors ligne"}
                  </span>
                </div>
                <div className="hrow">
                  <span className="hl">Modèle</span>
                  <span className="hv">{ovHealth.model || "—"}</span>
                </div>
                <div className="hrow">
                  <span className="hl">État</span>
                  <span className="hv">{ovHealth.ollamaOnline ? "En ligne" : "Hors ligne"}</span>
                </div>
                <div className="hrow">
                  <span className="hl">Taille de la base de données</span>
                  <span className="hv">{ovHealth.dbSizeMB != null ? `${ovHealth.dbSizeMB} MB` : "—"}</span>
                </div>
              </div>
              <div className="card health-card">
                <div className="hh">
                  <span className="hic" style={{ background: "var(--indigo-100)", color: "var(--indigo-700)" }}>
                    <Icon name="server" />
                  </span>
                  <div>
                    <h3>Serveur</h3>
                    <div className="hs">Local · LAN</div>
                  </div>
                  <span className="grow" />
                  <span className="status-live">
                    <span className="sdot" />
                    En bon état
                  </span>
                </div>
                <div className="hrow">
                  <span className="hl">Stockage utilisé</span>
                  <span className="hv">{kpis.storageGB != null ? `${kpis.storageGB} Go` : "—"}</span>
                </div>
                <div className="hrow">
                  <span className="hl">Classes</span>
                  <span className="hv">{kpis.classes ?? "—"}</span>
                </div>
                <div className="hrow">
                  <span className="hl">Élèves</span>
                  <span className="hv">{kpis.students ?? "—"}</span>
                </div>
              </div>
            </div>
            <div className="card panel" style={{ marginTop: "24px" }}>
              <div className="panel-head">
                <h3>
                  <Icon name="history" /> Activité récente
                </h3>
                <span className="link" onClick={() => showTab("audit")}>
                  Voir le journal d’audit complet →
                </span>
              </div>
              <div>
                {recent.length ? (
                  recent.slice(0, 4).map((a) => <AuditRow a={a} key={a.id} />)
                ) : (
                  <p className="muted" style={{ padding: "20px", textAlign: "center" }}>
                    {overview ? "Aucune activité récente" : "Chargement…"}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* APPROVALS */}
          <div className={`adm-panel ${tab === "approvals" ? "active" : ""}`.trim()}>
            <div className="sec-h">
              <div>
                <h2>Approbations en attente</h2>
                <div className="sub">
                  Approuvez les enseignants inscrits eux-mêmes et répondez aux demandes de réinitialisation du code PIN des élèves.
                </div>
              </div>
            </div>

            <div className="card panel" style={{ marginBottom: "22px" }}>
              <div className="panel-head">
                <h3><Icon name="user" /> Inscriptions des enseignants</h3>
              </div>
              {(approvals?.teachers || []).length === 0 ? (
                <p className="muted" style={{ padding: "20px", textAlign: "center" }}>
                  {approvals ? "Aucun enseignant en attente d’approbation" : "Chargement…"}
                </p>
              ) : (
                approvals.teachers.map((t) => (
                  <div className="hrow" key={t.id}>
                    <span className="hl">
                      <span className="avatar avatar-sm" style={{ background: avatarColor(t.name), marginRight: 10 }}>
                        {initials(t.name)}
                      </span>
                      {t.name} <span className="muted" style={{ marginLeft: 6 }}>{t.email}</span>
                    </span>
                    <span className="row" style={{ gap: "8px" }}>
                      <span className="muted tiny">{relTime(t.createdAt)}</span>
                      <button className="btn btn-primary btn-sm" onClick={() => decideTeacher(t, "approve")}>
                        <Icon name="check" /> Approuver
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => decideTeacher(t, "reject")}>
                        <Icon name="x" /> Rejeter
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="card panel">
              <div className="panel-head">
                <h3><Icon name="refresh" /> Demandes de réinitialisation du code PIN</h3>
              </div>
              {(approvals?.pinResets || []).length === 0 ? (
                <p className="muted" style={{ padding: "20px", textAlign: "center" }}>
                  {approvals ? "Aucune demande de réinitialisation" : "Chargement…"}
                </p>
              ) : (
                approvals.pinResets.map((r) => (
                  <div className="hrow" key={r.id}>
                    <span className="hl">
                      {r.name || "Élève"}{" "}
                      <span className="muted">a demandé un nouveau code PIN</span>
                    </span>
                    <span className="row" style={{ gap: "8px" }}>
                      <span className="muted tiny">{relTime(r.createdAt)}</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setTab("students"); onStudentSearch(r.name || ""); }}
                      >
                        Trouver l’élève →
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ASSIGNMENTS */}
          <div className={`adm-panel ${tab === "assign" ? "active" : ""}`.trim()}>
            <div className="sec-h">
              <div>
                <h2>Affectations enseignant ↔ classe</h2>
                <div className="sub">
                  Touchez une cellule pour faire défiler affecté → principal → aucun. L’enseignant principal apparaît en vert.
                </div>
              </div>
            </div>
            <div className="matrix-wrap">
              <table className="matrix">
                <thead>
                  <tr>
                    <th className="corner">Enseignant</th>
                    {(assignData?.classes || []).map((c) => (
                      <th key={c.id}>
                        <div className="cls-name">{c.name}</div>
                        <div className="cls-sub">{c.field || c.level}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(assignData?.teachers || []).map((t) => {
                    const tName = `${t.firstName} ${t.lastName}`.trim();
                    return (
                      <tr key={t.id}>
                        <td className="teach-cell">
                          <div className="tc">
                            <span className="avatar avatar-sm" style={{ background: avatarColor(tName) }}>
                              {initials(tName)}
                            </span>
                            <div>
                              <div className="nm">{tName}</div>
                              <div className="sj">Enseignant</div>
                            </div>
                          </div>
                        </td>
                        {(assignData?.classes || []).map((c) => {
                          const cell = assignData.cells[`${t.id}:${c.id}`] || {};
                          const on = !!cell.assigned;
                          const lead = !!cell.lead;
                          return (
                            <td key={c.id}>
                              <button
                                className={`mx-chip ${on ? "on" : ""} ${lead ? "lead" : ""}`
                                  .replace(/\s+/g, " ")
                                  .trim()}
                                onClick={() => cycleCell(t, c)}
                              >
                                {on ? <Icon name="check" /> : null}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {assignData && assignData.teachers?.length === 0 ? (
                    <tr>
                      <td className="teach-cell muted" colSpan={(assignData.classes || []).length + 1}>
                        Aucun enseignant pour le moment
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* CLASSES */}
          <div className={`adm-panel ${tab === "classes" ? "active" : ""}`.trim()}>
            <div className="toolbar">
              <div className="search">
                <Icon name="search" />
                <input
                  className="input"
                  placeholder="Rechercher des classes…"
                  value={clsFilter}
                  onChange={(e) => setClsFilter(e.target.value)}
                />
              </div>
              <span className="grow" />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setModal({ type: "class", mode: "add" })}
              >
                <Icon name="plus" /> Nouvelle classe
              </button>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Classe</th>
                    <th>Niveau</th>
                    <th>Filière</th>
                    <th>Élèves</th>
                    <th>Enseignants</th>
                    <th>Code d’invitation</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {clsList.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="cell-name">
                          <span className="nm">
                            {c.name}
                            {c.isArchived ? " (archivée)" : ""}
                          </span>
                        </div>
                      </td>
                      <td className="muted">{c.level || "—"}</td>
                      <td className="muted">{c.field || "—"}</td>
                      <td>
                        <span className="badge">{c.studentCount ?? 0}</span>
                      </td>
                      <td>
                        <span className="badge">{c.teacherCount ?? 0}</span>
                      </td>
                      <td>
                        {c.inviteCode ? (
                          <span className="invite-code" onClick={() => genInvite(c)} title="Régénérer">
                            {c.inviteCode}
                          </span>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => genInvite(c)}>
                            <Icon name="plus" /> Générer
                          </button>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="ico-btn"
                            title="Modifier"
                            onClick={() => setModal({ type: "class", mode: "edit", cls: c })}
                          >
                            <Icon name="edit" />
                          </button>
                          <button
                            className="ico-btn danger"
                            title="Supprimer"
                            onClick={() => deleteClass(c)}
                          >
                            <Icon name="x" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {classesLoaded && clsList.length === 0 ? (
                    <tr>
                      <td className="muted" colSpan={7} style={{ textAlign: "center", padding: "20px" }}>
                        Aucune classe correspondante
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* STUDENTS */}
          <div className={`adm-panel ${tab === "students" ? "active" : ""}`.trim()}>
            <div className="health-grid" style={{ gridTemplateColumns: "1.6fr 1fr", marginBottom: "22px" }}>
              <div>
                <div className="toolbar">
                  <div className="search">
                    <Icon name="search" />
                    <input
                      className="input"
                      placeholder="Rechercher des élèves…"
                      value={stuFilter}
                      onChange={(e) => onStudentSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className="input"
                    value={stuClass}
                    onChange={(e) => onStudentClass(e.target.value)}
                  >
                    <option value="">Toutes les classes</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <span className="grow" />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setModal({ type: "student", mode: "add" })}
                  >
                    <Icon name="plus" /> Ajouter un élève
                  </button>
                </div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Élève</th>
                        <th>Classe</th>
                        <th>Code PIN</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => {
                        const name = `${s.firstName} ${s.lastName}`.trim();
                        return (
                          <tr key={s.id} style={s.isActive === false ? { opacity: 0.55 } : undefined}>
                            <td>
                              <div className="cell-name">
                                <span
                                  className="avatar avatar-sm"
                                  style={{ background: s.avatarColor || avatarColor(name) }}
                                >
                                  {initials(name)}
                                </span>
                                <span className="nm">{name}</span>
                              </div>
                            </td>
                            <td className="muted">{s.className || "—"}</td>
                            <td>
                              <span className="pin-display">••••</span>
                            </td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="ico-btn"
                                  title="Réinitialiser le code PIN"
                                  onClick={() => resetPin(s)}
                                >
                                  <Icon name="refresh" />
                                </button>
                                <button
                                  className="ico-btn"
                                  title={s.isActive === false ? "Réactiver" : "Désactiver"}
                                  onClick={() => toggleStudentActive(s)}
                                >
                                  <Icon name={s.isActive === false ? "check" : "pause"} />
                                </button>
                                <button
                                  className="ico-btn danger"
                                  title="Retirer"
                                  onClick={() => deleteStudent(s)}
                                >
                                  <Icon name="x" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {studentsLoaded && students.length === 0 ? (
                        <tr>
                          <td className="muted" colSpan={4} style={{ textAlign: "center", padding: "20px" }}>
                            Aucun élève correspondant
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card panel" style={{ height: "fit-content" }}>
                <div className="panel-head">
                  <h3>
                    <Icon name="upload" /> Import en masse
                  </h3>
                </div>
                <label
                  className={`dropzone ${dragOver ? "drag" : ""}`.trim()}
                  style={{ display: "block" }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    readAndImport(e.dataTransfer.files?.[0]);
                  }}
                >
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    hidden
                    onChange={(e) => {
                      readAndImport(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <div className="dz-ic">
                    <Icon name="upload" />
                  </div>
                  <h4>Déposez un fichier CSV ici</h4>
                  <p>
                    ou <span className="browse">parcourez</span> pour téléverser
                    <br />
                    students.csv
                  </p>
                </label>
                <p className="tiny muted" style={{ marginTop: "12px", lineHeight: "1.5" }}>
                  Colonnes : <code>firstName, lastName, class</code>. Les codes PIN sont générés automatiquement.
                </p>
                <button
                  className="btn btn-secondary btn-block btn-sm"
                  style={{ marginTop: "10px" }}
                  onClick={downloadTemplate}
                >
                  <Icon name="download" /> Télécharger le modèle
                </button>

                {importResult ? (
                  <div style={{ marginTop: "16px" }}>
                    <div className="panel-head">
                      <h3>
                        <Icon name="file" /> Feuille des codes PIN de la classe
                      </h3>
                    </div>
                    {(importResult.created || []).map((c, i) => (
                      <div className="hrow" key={`c-${i}`}>
                        <span className="hl">
                          {c.name}
                          {c.className ? ` · ${c.className}` : ""}
                        </span>
                        <span className="hv">
                          <span className="pin-display">{c.pin}</span>
                        </span>
                      </div>
                    ))}
                    {(importResult.errors || []).map((e, i) => (
                      <div className="hrow" key={`e-${i}`}>
                        <span className="hl" style={{ color: "var(--danger-fg)" }}>
                          Ligne {e.line}
                        </span>
                        <span className="hv" style={{ color: "var(--danger-fg)" }}>
                          {e.reason}
                        </span>
                      </div>
                    ))}
                    <button
                      className="btn btn-secondary btn-block btn-sm"
                      style={{ marginTop: "10px" }}
                      onClick={() => window.print()}
                    >
                      <Icon name="file" /> Imprimer la feuille des codes PIN
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* SYSTEM HEALTH */}
          <div className={`adm-panel ${tab === "system" ? "active" : ""}`.trim()}>
            <div className="health-grid">
              <div className="card health-card">
                <div className="hh">
                  <span
                    className="hic"
                    style={
                      health?.ollama?.online
                        ? { background: "var(--success-bg)", color: "var(--success-fg)" }
                        : { background: "var(--danger-bg)", color: "var(--danger-fg)" }
                    }
                  >
                    <Icon name="cpu" />
                  </span>
                  <div>
                    <h3>Ollama · Tuteur IA</h3>
                    <div className="hs">{health?.ollama?.url || "Inférence locale"}</div>
                  </div>
                  <span className="grow" />
                  <span className="status-live">
                    <span className="sdot" />
                    {health?.ollama?.online ? "En cours d’exécution" : "Hors ligne"}
                  </span>
                </div>
                <div className="hrow">
                  <span className="hl">
                    <Icon name="sparkles" />
                    Modèle
                  </span>
                  <span className="hv">{health?.ollama?.model || "—"}</span>
                </div>
                <div className="hrow">
                  <span className="hl">
                    <Icon name="server" />
                    Point de terminaison
                  </span>
                  <span className="hv">{health?.ollama?.url || "—"}</span>
                </div>
                <div className="hrow">
                  <span className="hl">Modèles disponibles</span>
                  <span className="hv">{health?.ollama?.models?.length ?? 0}</span>
                </div>
                <button
                  className="btn btn-secondary btn-block btn-sm"
                  style={{ marginTop: "14px" }}
                  onClick={() => toast("Redémarrage du service Ollama…", { icon: "refresh" })}
                >
                  <Icon name="refresh" /> Redémarrer le service
                </button>
              </div>

              <div className="card health-card">
                <div className="hh">
                  <span className="hic" style={{ background: "var(--math-bg)", color: "var(--math)" }}>
                    <Icon name="database" />
                  </span>
                  <div>
                    <h3>Base de données & stockage</h3>
                    <div className="hs">SQLite · disque local</div>
                  </div>
                </div>
                <div className="hrow">
                  <span className="hl">Taille de la base de données</span>
                  <span className="hv">{health?.db?.sizeMB != null ? `${health.db.sizeMB} Mo` : "—"}</span>
                </div>
                <div className="hrow">
                  <span className="hl">
                    <Icon name="server" />
                    Disque
                  </span>
                  <span className="row" style={{ gap: "10px" }}>
                    <span className="gauge">
                      <span
                        style={{
                          width: `${health?.storage?.pct ?? 0}%`,
                          background: "var(--warning)",
                        }}
                      />
                    </span>
                    <span className="hv">
                      {health?.storage
                        ? `${health.storage.usedGB} / ${health.storage.totalGB} Go`
                        : "—"}
                    </span>
                  </span>
                </div>
                <div className="hrow">
                  <span className="hl">Leçons stockées</span>
                  <span className="hv">{health?.db?.lessons ?? "—"}</span>
                </div>
                <div className="hrow">
                  <span className="hl">Utilisateurs</span>
                  <span className="hv">{health?.db?.users ?? "—"}</span>
                </div>
              </div>

              <div className="card health-card">
                <div className="hh">
                  <span className="hic" style={{ background: "var(--indigo-100)", color: "var(--indigo-700)" }}>
                    <Icon name="save" />
                  </span>
                  <div>
                    <h3>Sauvegardes</h3>
                    <div className="hs">Hors ligne · USB</div>
                  </div>
                </div>
                <div className="hrow">
                  <span className="hl">Dernière sauvegarde</span>
                  <span className="hv">
                    {health?.lastBackup ? relTime(health.lastBackup.at) : "Jamais"}
                  </span>
                </div>
                <div className="hrow">
                  <span className="hl">Fichier de sauvegarde</span>
                  <span className="hv">{health?.lastBackup?.file || "—"}</span>
                </div>
                <div className="hrow">
                  <span className="hl">Taille de la sauvegarde</span>
                  <span className="hv">
                    {health?.lastBackup?.sizeMB != null ? `${health.lastBackup.sizeMB} Mo` : "—"}
                  </span>
                </div>
                <button
                  className="btn btn-primary btn-block"
                  style={{ marginTop: "14px" }}
                  disabled={usbBusy}
                  onClick={runUsbBackup}
                >
                  <Icon name={usbIcon} /> {usbLabel}
                </button>
              </div>

              <div className="card health-card">
                <div className="hh">
                  <span className="hic" style={{ background: "var(--sptic-bg)", color: "var(--sptic)" }}>
                    <Icon name="server" />
                  </span>
                  <div>
                    <h3>Réseau</h3>
                    <div className="hs">LAN isolé (air-gapped)</div>
                  </div>
                  <span className="grow" />
                  <span className="badge badge-success">Hors ligne</span>
                </div>
                <div className="hrow">
                  <span className="hl">Mode</span>
                  <span className="hv">{health?.network?.mode || "—"}</span>
                </div>
                <div className="hrow">
                  <span className="hl">Hôte</span>
                  <span className="hv">{health?.network?.host || "—"}</span>
                </div>
                <div className="hrow">
                  <span className="hl">Internet</span>
                  <span className="hv" style={{ color: "var(--text-muted)" }}>
                    Aucun (par conception)
                  </span>
                </div>
                <div className="hrow">
                  <span className="hl">Stockage libre</span>
                  <span className="hv">
                    {health?.storage?.freeGB != null ? `${health.storage.freeGB} Go` : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* AUDIT LOG */}
          <div className={`adm-panel ${tab === "audit" ? "active" : ""}`.trim()}>
            <div className="toolbar">
              <div className="search">
                <Icon name="search" />
                <input
                  className="input"
                  placeholder="Rechercher dans le journal d’audit…"
                  value={auditFilter}
                  onChange={(e) => onAuditSearch(e.target.value)}
                />
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onAuditSearch("")}
              >
                <Icon name="filter" /> Tous les événements
              </button>
              <span className="grow" />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => toast("Export du journal d’audit…", { icon: "download" })}
              >
                <Icon name="download" /> Exporter
              </button>
            </div>
            <div className="card panel">
              <div>
                {audit.length ? (
                  audit.map((a) => <AuditRow a={a} key={a.id} />)
                ) : (
                  <p className="muted" style={{ padding: "20px", textAlign: "center" }}>
                    {auditLoaded ? "Aucun événement correspondant" : "Chargement…"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {modal?.type === "class" ? (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{modal.mode === "edit" ? "Modifier la classe" : "Nouvelle classe"}</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = e.target;
                const name = f.name.value.trim();
                const level = f.level.value.trim();
                const field = f.field.value.trim();
                if (!name) return;
                if (modal.mode === "edit") submitEditClass(modal.cls.id, name, level, field);
                else submitAddClass(name, level, field);
              }}
            >
              <label className="tiny muted">Nom</label>
              <input className="input" name="name" defaultValue={modal.cls?.name || ""} autoFocus />
              <label className="tiny muted" style={{ marginTop: "10px", display: "block" }}>
                Niveau
              </label>
              <input className="input" name="level" defaultValue={modal.cls?.level || ""} />
              <label className="tiny muted" style={{ marginTop: "10px", display: "block" }}>
                Filière
              </label>
              <input className="input" name="field" defaultValue={modal.cls?.field || ""} />
              <div className="row-actions" style={{ marginTop: "18px", justifyContent: "flex-end", gap: "10px" }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  {modal.mode === "edit" ? "Enregistrer" : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {modal?.type === "student" ? (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Ajouter un élève</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = e.target;
                const firstName = f.firstName.value.trim();
                const lastName = f.lastName.value.trim();
                const classId = f.classId.value;
                if (!firstName || !lastName || !classId) return;
                submitAddStudent(firstName, lastName, classId);
              }}
            >
              <label className="tiny muted">Prénom</label>
              <input className="input" name="firstName" autoFocus />
              <label className="tiny muted" style={{ marginTop: "10px", display: "block" }}>
                Nom
              </label>
              <input className="input" name="lastName" />
              <label className="tiny muted" style={{ marginTop: "10px", display: "block" }}>
                Classe
              </label>
              <select className="input" name="classId" defaultValue="">
                <option value="" disabled>
                  Sélectionnez une classe…
                </option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="row-actions" style={{ marginTop: "18px", justifyContent: "flex-end", gap: "10px" }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  Ajouter
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {modal?.type === "pin" ? (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{modal.title}</h2>
            </div>
            <p className="muted" style={{ marginBottom: "14px" }}>
              {modal.name} — notez ce code PIN maintenant, il ne sera plus affiché.
            </p>
            <div style={{ textAlign: "center", margin: "10px 0 20px" }}>
              <span className="pin-display" style={{ fontSize: "24px", padding: "10px 18px" }}>
                {modal.pin}
              </span>
            </div>
            <div className="row-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal(null)}>
                Terminé
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal?.type === "invite" ? (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Code d’invitation de la classe</h2>
            </div>
            <p className="muted" style={{ marginBottom: "14px" }}>
              Partagez ce code avec les élèves de <b>{modal.name}</b>. Ils s’inscrivent sur{" "}
              <code>/register</code> et définissent leur propre code PIN.
            </p>
            <div style={{ textAlign: "center", margin: "10px 0 20px" }}>
              <span className="pin-display" style={{ fontSize: "24px", padding: "10px 18px", letterSpacing: "0.12em" }}>
                {modal.code}
              </span>
            </div>
            <div className="row-actions" style={{ justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { navigator.clipboard?.writeText(modal.code); toast("Code copié", { icon: "check" }); }}
              >
                <Icon name="file" /> Copier
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal(null)}>
                Terminé
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
