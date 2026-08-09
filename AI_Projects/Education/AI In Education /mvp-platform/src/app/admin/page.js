"use client";
import { useState, useEffect, useCallback } from "react";
import "./admin.css";
import Icon from "@/components/ui/Icon";
import { OfflinePill, Avatar } from "@/components/ui/chrome";
import { avatarColor, initials } from "@/lib/icons";
import { toast } from "@/lib/toast";
import AdminContentPanel, { BookClassLinks } from "@/components/admin/AdminContentPanel";
import AdminSidebar, { ADMIN_TABS as TABS } from "@/components/admin/AdminSidebar";

const TAB_NAMES = {
  overview: "Vue d’ensemble",
  approvals: "Approbations",
  assign: "Affectations",
  supervisors: "Titulaires",
  teachers: "Enseignants",
  pedagogy: "Pédagogie",
  content: "Contenu",
  offerings: "Liaisons",
  classes: "Classes",
  students: "Élèves",
  system: "État du système",
  audit: "Journal d’audit",
};

// Static presentation for KPI cards; values come from the API.
// Storage used to sit here as a bare "446,7 Go" — a figure with no denominator
// that no one can act on. It belongs with the other health signals, where its
// total and its percentage are shown alongside it.
const KPI_DEFS = [
  { key: "teachers", ic: "user", c: "var(--indigo-600)", bg: "var(--indigo-100)", label: "Enseignants" },
  { key: "students", ic: "users", c: "var(--math)", bg: "var(--math-bg)", label: "Élèves" },
  { key: "classes", ic: "folder", c: "var(--sptic)", bg: "var(--sptic-bg)", label: "Classes" },
];

// Derived server state → how the header pill reads. Never hard-coded: the pill
// said "En bon état" unconditionally, and would have said it on a full disk.
const STATE_META = {
  ok: { label: "En bon état", cls: "ok" },
  warn: { label: "À surveiller", cls: "warn" },
  critical: { label: "Action requise", cls: "critical" },
};

function fmtGo(n) {
  return typeof n === "number" ? n.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—";
}

// "Sauvegarde" is the highest-stakes line on an air-gapped server holding the
// only copy of a school's work, and the overview never showed it at all.
function backupLine(backup, lastBackupAt) {
  if (!backup || backup.state === "never") return { text: "Jamais effectuée", tone: "critical" };
  const when = lastBackupAt ? new Date(lastBackupAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
  if (backup.days === 0) return { text: `Aujourd’hui${when ? ` · ${when}` : ""}`, tone: "ok" };
  const ago = `il y a ${backup.days} jour${backup.days > 1 ? "s" : ""}`;
  return { text: `${ago}${when ? ` · ${when}` : ""}`, tone: backup.state === "stale" ? "warn" : "ok" };
}

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
  TEACHER_CREATE: "Ajout d’enseignant",
  ASSIGNMENT_SET: "Affectation", BACKUP: "Sauvegarde",
  // Eleven of the nineteen action types in the journal had no French label and
  // fell through to the raw enum. They were easy to miss while the feed was
  // mostly "Déconnexion"; filtering session churn out of the overview puts
  // them front and centre, so "LESSON_COMPANION_SET" now had to become words.
  LESSON_CREATE: "Création de leçon", LESSON_EDIT: "Modification de leçon",
  LESSON_DELETE: "Suppression de leçon", LESSON_UNDELETE: "Restauration de leçon",
  LESSON_PUBLISH: "Publication de leçon", LESSON_UNPUBLISH: "Dépublication de leçon",
  LESSON_COMPANION_SET: "Complément rattaché",
  LESSON_CONNECT: "Leçon reliée", LESSON_DISCONNECT: "Leçon déliée",
  QUIZ_EDIT: "Modification de quiz",
  EXERCISE_CREATE: "Création d’exercice",
  BOOK_EXERCISE_FIX: "Correction d’exercice", BOOK_EXERCISE_FIX_REVERT: "Correction annulée",
  PROJECT_GROUP_CREATE: "Création de groupe", PROJECT_GROUP_ASSIGN: "Projet attribué",
};
const TARGET_LABELS = {
  staff: "personnel", student: "élève", students: "élèves", teacher: "enseignant",
  class: "classe", system: "système", assignment: "affectation",
  lesson: "leçon", exercise: "exercice", "book-exercise": "exercice du manuel",
  project: "projet", project_group: "groupe",
};
const actionLabel = (a) => ACTION_LABELS[a] || a;
const targetLabel = (t) => TARGET_LABELS[t] || t;
// The row prints the action then the target, which reads "Création de leçon
// leçon" now that the lesson actions name their object. Append the target only
// when the label has not already said it.
const extraTarget = (action, targetType) => {
  if (!targetType) return null;
  const t = targetLabel(targetType);
  return actionLabel(action).toLowerCase().includes(t.toLowerCase()) ? null : t;
};

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
          {extraTarget(a.action, a.targetType) ? (
            <>
              {" "}
              <b>{extraTarget(a.action, a.targetType)}</b>
            </>
          ) : null}
        </div>
        <div className="am">{relTime(a.createdAt)}</div>
      </div>
      <span className="audit-actor">{a.actorName}</span>
    </div>
  );
}

// Class create/edit form. Level and filière are picked from the Offering table
// rather than typed: a pair that isn't offered resolves to no books, and the
// teacher assignment then silently falls back to an arbitrary subject.
function ClassForm({ cls, mode, offerings, onSubmit, onCancel }) {
  const levels = [...new Set(offerings.map((o) => o.level))];
  const [level, setLevel] = useState(cls?.level || levels[0] || "");
  const fieldsForLevel = offerings.filter((o) => o.level === level);
  // Keep the filière valid whenever the level changes.
  const [field, setField] = useState(cls?.field || "");
  const currentField = fieldsForLevel.some((o) => o.field === field) ? field : fieldsForLevel[0]?.field || "";
  const books = fieldsForLevel.find((o) => o.field === currentField)?.subjects || [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const name = e.target.name.value.trim();
        if (!name || !level || !currentField) return;
        onSubmit({ name, level, field: currentField });
      }}
    >
      <label className="tiny muted">Nom</label>
      <input className="input" name="name" defaultValue={cls?.name || ""} autoFocus />

      <label className="tiny muted" style={{ marginTop: "10px", display: "block" }}>Niveau</label>
      <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
        {levels.map((l) => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>

      <label className="tiny muted" style={{ marginTop: "10px", display: "block" }}>Filière</label>
      <select className="input" value={currentField} onChange={(e) => setField(e.target.value)}>
        {fieldsForLevel.map((o) => (
          <option key={o.field} value={o.field}>{o.field}</option>
        ))}
      </select>

      <div className="cls-books">
        <span className="muted tiny">
          {books.length ? `Manuels étudiés : ${books.join(" · ")}` : "Aucun manuel pour cette combinaison"}
        </span>
      </div>

      <div className="row-actions" style={{ marginTop: "18px", justifyContent: "flex-end", gap: "10px" }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!currentField}>
          {mode === "edit" ? "Enregistrer" : "Créer"}
        </button>
      </div>
    </form>
  );
}

export default function AdminConsole() {
  const [collapsed, setCollapsed] = useState(true); // left menu auto-hides to a rail; burger pins it open
  const [tab, setTab] = useState("overview");

  // Deep-link support: /admin?tab=content opens that tab directly. Lets the
  // shared AdminSidebar (used in the Studio) link back to a specific tab.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.tab === t)) setTab(t);
  }, []);

  // ---- Overview ----
  const [overview, setOverview] = useState(null);

  // ---- Approvals ----
  const [approvals, setApprovals] = useState(null);

  // ---- Assignments ----
  const [assignData, setAssignData] = useState(null);

  // ---- Supervisors (titulaires) ----
  const [supervisors, setSupervisors] = useState(null);

  // ---- Teacher directory (Enseignants tab) ----
  const [teacherDir, setTeacherDir] = useState(null);

  // ---- Pedagogy (oversight) ----
  const [pedagogy, setPedagogy] = useState(null);

  // ---- Classes ----
  const [classes, setClasses] = useState([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  // Valid (level, field) pairs + the books each studies — constrains the class form.
  const [offerings, setOfferings] = useState([]);
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

  const loadSupervisors = useCallback(() => {
    api("/api/admin/supervisors/")
      .then((d) => d && setSupervisors(d))
      .catch(() => {});
  }, []);

  const loadTeachers = useCallback(() => {
    api("/api/admin/teachers/")
      .then((d) => d && setTeacherDir(d))
      .catch(() => {});
  }, []);

  const loadPedagogy = useCallback(() => {
    api("/api/admin/pedagogy/")
      .then((d) => d && setPedagogy(d))
      .catch(() => {});
  }, []);

  const loadClasses = useCallback(() => {
    api("/api/admin/classes/")
      .then((d) => {
        if (d) {
          setClasses(d.classes || []);
          setOfferings(d.offerings || []);
        }
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
    if (tab === "supervisors" && !supervisors) loadSupervisors();
    if (tab === "teachers" && !teacherDir) loadTeachers();
    if (tab === "pedagogy" && !pedagogy) loadPedagogy();
    if (tab === "classes" && !classesLoaded) loadClasses();
    if (tab === "students" && !studentsLoaded) loadStudents("", "");
    if (tab === "system" && !health) loadHealth();
    if (tab === "audit" && !auditLoaded) loadAudit("");
  }, [
    tab,
    assignData,
    supervisors,
    loadSupervisors,
    teacherDir,
    loadTeachers,
    pedagogy,
    classesLoaded,
    studentsLoaded,
    health,
    auditLoaded,
    loadApprovals,
    loadAssignments,
    loadPedagogy,
    loadClasses,
    loadStudents,
    loadHealth,
    loadAudit,
  ]);

  // --- Create a teacher account (super admin only; teachers never self-register) ---
  const emptyTeacher = { firstName: "", lastName: "", email: "", password: "", disciplines: [] };
  const [newTeacher, setNewTeacher] = useState(emptyTeacher);
  const [creatingTeacher, setCreatingTeacher] = useState(false);
  const [teacherErr, setTeacherErr] = useState("");
  // Credentials of the just-created teacher, shown once so the admin can pass them on.
  const [createdTeacher, setCreatedTeacher] = useState(null);
  const setNT = (k) => (e) => setNewTeacher((s) => ({ ...s, [k]: e.target.value }));
  const toggleNewTeacherDisc = (key) =>
    setNewTeacher((s) => ({
      ...s,
      disciplines: s.disciplines.includes(key) ? s.disciplines.filter((d) => d !== key) : [...s.disciplines, key],
    }));

  const TEACHER_ERRORS = {
    EMAIL_TAKEN: "Un compte avec cette adresse e-mail existe déjà.",
    BAD_EMAIL: "Adresse e-mail invalide.",
    WEAK_PASSWORD: "Le mot de passe doit comporter au moins 8 caractères.",
    MISSING_FIELDS: "Prénom, nom et e-mail sont obligatoires.",
  };

  const submitNewTeacher = () => {
    if (creatingTeacher) return;
    setTeacherErr("");
    setCreatingTeacher(true);
    api("/api/admin/teachers/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTeacher),
    })
      .then((r) => {
        if (!r) return;
        setCreatedTeacher({ ...r.teacher, password: r.password });
        setNewTeacher(emptyTeacher);
        toast(`Compte créé : ${r.teacher.name}`, { icon: "check" });
        loadOverview();
        loadTeachers();
      })
      .catch((e) => setTeacherErr(TEACHER_ERRORS[e.message] || "Impossible de créer le compte."))
      .finally(() => setCreatingTeacher(false));
  };

  // --- Enseignants: assignment editor (PUTs to /assign, refreshes the directory) ---
  const putTeacherAssign = (payload) =>
    api("/api/admin/teachers/assign/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => { if (r) setTeacherDir(r); return r; })
      .catch(() => { toast("Impossible de mettre à jour l’affectation", { icon: "alert" }); loadTeachers(); });

  const toggleTeacherSubject = (teacher, cls, subject, on) =>
    putTeacherAssign({ teacherId: teacher.id, classId: cls.id, subjectSlug: subject.slug, on }).then((r) => {
      if (r) toast(`${on ? "Affecté" : "Retiré"} : ${teacher.name} · ${cls.name} · ${subject.name}`, { icon: on ? "check" : "x" });
    });

  const toggleTeacherLead = (teacher, cls, isLead) =>
    putTeacherAssign({ classId: cls.id, teacherId: isLead ? null : teacher.id, lead: true }).then((r) => {
      if (r) toast(isLead ? `Titulaire retiré · ${cls.name}` : `Titulaire : ${teacher.name} · ${cls.name}`, { icon: isLead ? "x" : "check" });
    });

  const toggleTeacherDiscipline = (teacher, key) => {
    const next = teacher.disciplines.includes(key) ? teacher.disciplines.filter((d) => d !== key) : [...teacher.disciplines, key];
    putTeacherAssign({ teacherId: teacher.id, disciplines: next }).then((r) => {
      if (r) toast(`Matières mises à jour : ${teacher.name}`, { icon: "check" });
    });
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

  // --- Supervisors: set/clear a class's single titulaire ---
  const setSupervisor = (cls, teacherId) => {
    api("/api/admin/supervisors/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId: cls.id, teacherId: teacherId || null }),
    })
      .then((r) => {
        if (r) {
          setSupervisors(r);
          const name = teacherId ? r.teachers.find((t) => t.id === teacherId)?.name || "" : null;
          toast(teacherId ? `Titulaire défini : ${name} · ${cls.name}` : `Titulaire retiré · ${cls.name}`, {
            icon: teacherId ? "check" : "x",
          });
        }
      })
      .catch(() => {
        toast("Impossible de mettre à jour le titulaire", { icon: "alert" });
        loadSupervisors();
      });
  };

  // --- Set what a teacher teaches (discipline) → re-resolves their books ---
  const toggleDiscipline = (teacher, key) => {
    const cur = teacher.disciplines || [];
    const next = cur.includes(key) ? cur.filter((d) => d !== key) : [...cur, key];
    api("/api/admin/assignments/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId: teacher.id, disciplines: next }),
    })
      .then((r) => {
        if (r) {
          setAssignData(r);
          toast(`Matière mise à jour : ${teacher.firstName} ${teacher.lastName}`, { icon: "check" });
        }
      })
      .catch(() => {
        toast("Impossible de mettre à jour la matière", { icon: "alert" });
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
        else if (e.body?.error === "BAD_OFFERING")
          toast("Cette combinaison niveau / filière n’étudie aucun manuel", { icon: "alert" });
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
      .catch((e) => {
        if (e.body?.error === "BAD_OFFERING")
          toast("Cette combinaison niveau / filière n’étudie aucun manuel", { icon: "alert" });
        else toast("Impossible de mettre à jour la classe", { icon: "alert" });
      });
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
  const pendingCount = approvals?.pinResets?.length || 0;
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
    <div className={`t-app teacher-page admin-page ${collapsed ? "collapsed" : ""}`.trim()}>
      <AdminSidebar active={tab} onSelect={showTab} pendingCount={pendingCount} />

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
          <div className="adm-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.tab}
                type="button"
                role="tab"
                aria-selected={tab === t.tab}
                title={t.lbl}
                className={`adm-tab ${tab === t.tab ? "active" : ""}`.trim()}
                onClick={() => showTab(t.tab)}
              >
                <Icon name={t.ic} />
                <span className="adm-tab-lbl">{t.lbl}</span>
                {t.tab === "approvals" && pendingCount > 0 ? <span className="adm-tab-badge">{pendingCount}</span> : null}
              </button>
            ))}
          </div>

          {/* OVERVIEW */}
          <div className={`adm-panel ${tab === "overview" ? "active" : ""}`.trim()}>
            <div className="kpi-grid">
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
                {/* The "État" row repeated the pill above it, and the database
                    size belonged with the server, not the tutor. */}
                <div className="hrow">
                  <span className="hl">Modèle</span>
                  <span className="hv">{ovHealth.model || "—"}</span>
                </div>
                <div className="hrow">
                  <span className="hl">Sert</span>
                  <span className="hv">Copilot élève · Copilot enseignant</span>
                </div>
                {!ovHealth.ollamaOnline && (
                  <div className="hrow">
                    <span className="hl">Conséquence</span>
                    <span className="hv tone-warn">Leçons et quiz restent accessibles</span>
                  </div>
                )}
              </div>
              {(() => {
                const st = STATE_META[ovHealth.state] || STATE_META.ok;
                const sto = ovHealth.storage || {};
                const stoBand = sto.pct >= 90 ? "critical" : sto.pct >= 75 ? "warn" : "ok";
                const bk = backupLine(ovHealth.backup, ovHealth.lastBackupAt);
                return (
                  <div className="card health-card">
                    <div className="hh">
                      <span className="hic" style={{ background: "var(--indigo-100)", color: "var(--indigo-700)" }}>
                        <Icon name="server" />
                      </span>
                      <div>
                        <h3>Serveur</h3>
                        <div className="hs">Local · LAN · hors ligne</div>
                      </div>
                      <span className="grow" />
                      <span className={`adm-state ${st.cls}`}>
                        <span className="sdot" />
                        {overview ? st.label : "…"}
                      </span>
                    </div>
                    <div className="hrow hrow-stack">
                      <div className="hrow-top">
                        <span className="hl">Stockage</span>
                        <span className={`hv tone-${stoBand}`}>
                          {sto.pct != null ? `${sto.pct} %` : "—"}
                          <small>{sto.totalGB ? ` · ${fmtGo(sto.freeGB)} Go libres sur ${fmtGo(sto.totalGB)}` : ""}</small>
                        </span>
                      </div>
                      <div className="adm-bar">
                        <span className={`tone-${stoBand}`} style={{ width: `${Math.min(100, sto.pct || 0)}%` }} />
                      </div>
                    </div>
                    <div className="hrow">
                      <span className="hl">Dernière sauvegarde</span>
                      <span className={`hv tone-${bk.tone}`}>{overview ? bk.text : "—"}</span>
                    </div>
                    <div className="hrow">
                      <span className="hl">Base de données</span>
                      <span className="hv">{ovHealth.dbSizeMB != null ? `${ovHealth.dbSizeMB} MB` : "—"}</span>
                    </div>
                    {ovHealth.backup?.state === "never" && (
                      <button className="adm-fixnow" onClick={() => showTab("system")}>
                        <Icon name="database" /> Aucune sauvegarde n’a jamais été faite — en lancer une
                        <Icon name="chevR" />
                      </button>
                    )}
                  </div>
                );
              })()}
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
                  /* Already filtered and capped server-side by notableAudit —
                     slicing again here is what hid the substance behind
                     sign-outs when the API sent eight unfiltered rows. */
                  recent.map((a) => <AuditRow a={a} key={a.id} />)
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
                <h2>Approbations</h2>
                <div className="sub">
                  Répondez aux demandes de réinitialisation du code PIN des élèves. Les comptes enseignants se gèrent dans l’onglet « Enseignants ».
                </div>
              </div>
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

          {/* ENSEIGNANTS — create teachers + assign their subjects/classes */}
          <div className={`adm-panel ${tab === "teachers" ? "active" : ""}`.trim()}>
            <div className="sec-h">
              <div>
                <h2>Enseignants</h2>
                <div className="sub">Créez les comptes enseignants et affectez-leur leurs matières et classes.</div>
              </div>
            </div>

            <div className="card panel" style={{ marginBottom: "22px" }}>
              <div className="panel-head">
                <h3><Icon name="user" /> Créer un enseignant</h3>
              </div>
              {createdTeacher ? (
                <div className="new-teacher-done">
                  <p>Compte créé pour <b>{createdTeacher.name}</b> ({createdTeacher.email}).</p>
                  <p className="muted tiny">
                    Mot de passe temporaire — notez-le maintenant, il ne sera plus affiché. L’enseignant devra le changer à sa première connexion.
                  </p>
                  <div className="temp-pass"><code>{createdTeacher.password}</code></div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setCreatedTeacher(null)}>Créer un autre enseignant</button>
                </div>
              ) : (
                <div className="new-teacher-form">
                  <div className="nt-grid">
                    <input className="input" placeholder="Prénom" value={newTeacher.firstName} onChange={setNT("firstName")} />
                    <input className="input" placeholder="Nom" value={newTeacher.lastName} onChange={setNT("lastName")} />
                    <input className="input" type="email" placeholder="nom@mwalimu.school" value={newTeacher.email} onChange={setNT("email")} />
                    <input
                      className="input"
                      type="text"
                      placeholder="Mot de passe (laisser vide = généré)"
                      value={newTeacher.password}
                      onChange={setNT("password")}
                      onKeyDown={(e) => { if (e.key === "Enter") submitNewTeacher(); }}
                    />
                  </div>
                  <div className="ht-disc">
                    <span className="muted tiny">Matière enseignée :</span>
                    <div className="disc-chips">
                      {(teacherDir?.disciplines || []).map((d) => (
                        <button
                          key={d.key}
                          className={`disc-chip ${newTeacher.disciplines.includes(d.key) ? "on" : ""}`.trim()}
                          onClick={() => toggleNewTeacherDisc(d.key)}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {teacherErr && <p className="muted tiny" style={{ color: "var(--red-600, #dc2626)" }}>{teacherErr}</p>}
                  <button className="btn btn-primary btn-sm" onClick={submitNewTeacher} disabled={creatingTeacher}>
                    <Icon name="check" /> {creatingTeacher ? "Création…" : "Créer l’enseignant"}
                  </button>
                </div>
              )}
            </div>

            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Enseignant</th>
                    <th>Matières</th>
                    <th>Classes &amp; affectations</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(teacherDir?.teachers || []).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="cell-name">
                          <span className="avatar avatar-sm" style={{ background: t.avatarColor || avatarColor(t.name) }}>{initials(t.name)}</span>
                          <div>
                            <span className="nm">{t.name}{t.isActive ? "" : " (désactivé)"}</span>
                            <div className="muted tiny">{t.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="disc-chips">
                          {t.disciplines.length
                            ? t.disciplines.map((key) => {
                                const d = (teacherDir?.disciplines || []).find((x) => x.key === key);
                                return <span key={key} className="disc-chip on">{d?.label || key}</span>;
                              })
                            : <span className="muted tiny">—</span>}
                        </div>
                      </td>
                      <td>
                        <div className="sup-teachers">
                          {t.assignments.length
                            ? t.assignments.map((a) => (
                                <span key={a.classId} className={`sup-chip ${a.isLead ? "lead" : ""}`.trim()}>
                                  {a.isLead ? <Icon name="check" /> : null}
                                  {a.className}{a.subjects.length ? ` · ${a.subjects.map((s) => s.name).join(", ")}` : ""}
                                </span>
                              ))
                            : <span className="muted tiny">Aucune affectation</span>}
                        </div>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: "teacherAssign", teacherId: t.id })}>
                            <Icon name="layers" /> Affecter
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {teacherDir && teacherDir.teachers.length === 0 ? (
                    <tr>
                      <td className="muted" colSpan={4} style={{ textAlign: "center", padding: "20px" }}>Aucun enseignant — créez-en un ci-dessus.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
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
                              <div className="disc-chips">
                                {(assignData?.disciplines || []).map((d) => {
                                  const active = (t.disciplines || []).includes(d.key);
                                  return (
                                    <button
                                      key={d.key}
                                      className={`disc-chip ${active ? "on" : ""}`.trim()}
                                      onClick={() => toggleDiscipline(t, d.key)}
                                      title={active ? `Retirer ${d.label}` : `Enseigne ${d.label}`}
                                    >
                                      {d.label}
                                    </button>
                                  );
                                })}
                              </div>
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

          {/* TITULAIRES — class-centric supervisor management */}
          <div className={`adm-panel ${tab === "supervisors" ? "active" : ""}`.trim()}>
            <div className="sec-h">
              <div>
                <h2>Titulaires de classe</h2>
                <div className="sub">
                  Chaque classe a un enseignant titulaire (superviseur). Seules les classes avec un titulaire apparaissent à la connexion des élèves.
                </div>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Classe</th>
                    <th>Élèves</th>
                    <th>Titulaire</th>
                    <th>Connexion élèves</th>
                    <th>Enseignants</th>
                  </tr>
                </thead>
                <tbody>
                  {(supervisors?.classes || []).map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="cell-name"><span className="nm">{c.name}</span></div>
                        <div className="muted" style={{ fontSize: "12px" }}>
                          {[c.level, c.field].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td><span className="badge">{c.studentCount ?? 0}</span></td>
                      <td>
                        <select
                          className="input sup-select"
                          value={c.supervisorId || ""}
                          onChange={(e) => setSupervisor(c, e.target.value)}
                        >
                          <option value="">— Aucun —</option>
                          {(supervisors?.teachers || []).map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {c.supervisorId ? (
                          <span className="sup-status ok"><Icon name="check" /> Visible</span>
                        ) : (
                          <span className="sup-status off"><Icon name="eye" /> Masquée</span>
                        )}
                      </td>
                      <td>
                        <div className="sup-teachers">
                          {c.teachers.length ? (
                            c.teachers.map((t) => (
                              <span key={t.id} className={`sup-chip ${t.id === c.supervisorId ? "lead" : ""}`.trim()}>
                                {t.id === c.supervisorId ? <Icon name="check" /> : null}
                                {t.name}
                              </span>
                            ))
                          ) : (
                            <span className="muted">Aucun</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {supervisors && supervisors.classes.length === 0 ? (
                    <tr>
                      <td className="muted" colSpan={5} style={{ textAlign: "center", padding: "20px" }}>
                        Aucune classe
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* CONTENU — books/subjects/modules/lessons authoring */}
          <div className={`adm-panel ${tab === "content" ? "active" : ""}`.trim()}>
            <AdminContentPanel active={tab === "content"} />
          </div>

          {/* LIAISONS — book ↔ class-section links (Offerings) */}
          <div className={`adm-panel ${tab === "offerings" ? "active" : ""}`.trim()}>
            {tab === "offerings" && (
              <div className="acp teacher-page">
                <div className="acp-banner">
                  <Icon name="info" />
                  <span>
                    Reliez chaque livre aux sections (niveau · filière) qui l’étudient. Chaque classe hérite des livres de sa section.
                    Avant de détacher un livre, vérifiez les enseignants déjà affectés.
                  </span>
                </div>
                <BookClassLinks />
              </div>
            )}
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

          <div className={`adm-panel ${tab === "pedagogy" ? "active" : ""}`.trim()}>
            <PedagogyPanel data={pedagogy} />
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
            <ClassForm
              cls={modal.cls}
              mode={modal.mode}
              offerings={offerings}
              onCancel={() => setModal(null)}
              onSubmit={({ name, level, field }) => {
                if (modal.mode === "edit") submitEditClass(modal.cls.id, name, level, field);
                else submitAddClass(name, level, field);
              }}
            />
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

      {modal?.type === "teacherAssign" ? (() => {
        const t = (teacherDir?.teachers || []).find((x) => x.id === modal.teacherId);
        if (!t) return null;
        const assignedByClass = new Map(
          t.assignments.map((a) => [a.classId, { subjects: new Set(a.subjects.map((s) => s.slug)), isLead: a.isLead }]),
        );
        const discSet = new Set(t.disciplines);
        const rows = (teacherDir?.classes || [])
          .map((c) => ({ ...c, teach: c.subjects.filter((s) => discSet.has(s.family)) }))
          .filter((c) => c.teach.length > 0);
        return (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
            <div className="modal" style={{ width: "min(560px, 100%)" }}>
              <div className="modal-head">
                <div>
                  <h2>Affecter {t.name}</h2>
                  <div className="sub">{t.email}</div>
                </div>
                <button className="icon-x" onClick={() => setModal(null)}><Icon name="x" /></button>
              </div>

              <div className="field" style={{ marginTop: "6px" }}>
                <label>Matières enseignées</label>
                <div className="disc-chips">
                  {(teacherDir?.disciplines || []).map((d) => (
                    <button
                      key={d.key}
                      className={`disc-chip ${t.disciplines.includes(d.key) ? "on" : ""}`.trim()}
                      onClick={() => toggleTeacherDiscipline(t, d.key)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ta-list">
                {rows.length === 0 ? (
                  <p className="muted tiny">Choisissez au moins une matière ci-dessus pour voir les classes concernées.</p>
                ) : (
                  rows.map((c) => {
                    const cur = assignedByClass.get(c.id) || { subjects: new Set(), isLead: false };
                    return (
                      <div className="ta-row" key={c.id}>
                        <div className="ta-head">
                          <span className="ta-cls">
                            {c.name} <span className="muted tiny">{[c.level, c.field].filter(Boolean).join(" · ")}</span>
                          </span>
                          <button
                            className={`ta-lead ${cur.isLead ? "on" : ""}`.trim()}
                            onClick={() => toggleTeacherLead(t, c, cur.isLead)}
                            title="Titulaire de la classe"
                          >
                            <Icon name="check" /> Titulaire
                          </button>
                        </div>
                        <div className="ta-subjects">
                          {c.teach.map((s) => (
                            <label key={s.slug} className={`ta-subj ${cur.subjects.has(s.slug) ? "on" : ""}`.trim()}>
                              <input
                                type="checkbox"
                                checked={cur.subjects.has(s.slug)}
                                onChange={(e) => toggleTeacherSubject(t, c, s, e.target.checked)}
                              />
                              {s.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="row-actions" style={{ justifyContent: "flex-end", marginTop: "16px" }}>
                <button className="btn btn-primary btn-sm" onClick={() => setModal(null)}>Terminé</button>
              </div>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}

// ── Pédagogie (super-admin oversight): teacher progression, course coverage, projects ──
const PROJ_STATUS = { PUBLISHED: { l: "Publié", c: "ok" }, DRAFT: { l: "Brouillon", c: "neutral" } };
const barColor = (p) => (p >= 60 ? "var(--success)" : p >= 30 ? "var(--warning)" : "var(--danger)");

function PedagogyPanel({ data }) {
  if (!data) return <p className="muted" style={{ padding: 24, textAlign: "center" }}>Chargement…</p>;
  const { teachers, programme, projects, summary } = data;
  return (
    <>
      <div className="ped-summary">
        <div className="card ped-stat"><span className="ped-stat-ic" style={{ background: "var(--indigo-100)", color: "var(--indigo-700)" }}><Icon name="user" /></span><div><div className="ped-stat-v">{summary.teacherCount}</div><div className="ped-stat-l">Enseignants actifs</div></div></div>
        <div className="card ped-stat"><span className="ped-stat-ic" style={{ background: "var(--success-bg)", color: "var(--success-fg)" }}><Icon name="trend" /></span><div><div className="ped-stat-v">{summary.avgProgress}%</div><div className="ped-stat-l">Progression moyenne</div></div></div>
        <div className="card ped-stat"><span className="ped-stat-ic" style={{ background: "var(--sptic-bg)", color: "var(--sptic)" }}><Icon name="layers" /></span><div><div className="ped-stat-v">{summary.projectCount}</div><div className="ped-stat-l">Projets créés</div></div></div>
        <div className="card ped-stat"><span className="ped-stat-ic" style={{ background: "var(--warning-bg)", color: "var(--warning-fg)" }}><Icon name="check" /></span><div><div className="ped-stat-v">{summary.publishedProjects}</div><div className="ped-stat-l">Projets publiés</div></div></div>
      </div>

      <div className="ped-grid">
        <div className="ped-col">
          <h2 className="ped-h">Progression des enseignants</h2>
          {teachers.length === 0 ? <div className="card panel muted">Aucun enseignant.</div> : teachers.map((t) => (
            <div className="card ped-teacher" key={t.id}>
              <div className="ped-teacher-head">
                <Avatar name={t.name} size="avatar-sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ped-teacher-n">{t.name}</div>
                  <div className="ped-teacher-e">{t.email || "—"}</div>
                </div>
                <div className="ped-teacher-pct" style={{ color: barColor(t.avgProgress) }}>{t.avgProgress}%</div>
              </div>
              {t.classes.length === 0 ? <div className="ped-noclass">Aucune classe affectée</div> : (
                <div className="ped-classes">
                  {t.classes.map((c) => (
                    <div className="ped-class" key={c.id}>
                      <span className="ped-class-n">{c.name}</span>
                      <span className="ped-bar"><span style={{ width: `${c.avgProgress}%`, background: barColor(c.avgProgress) }} /></span>
                      <span className="ped-class-v">{c.avgProgress}%</span>
                      <span className="ped-class-meta">{c.activeWeek}/{c.studentCount} actifs</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <h2 className="ped-h" style={{ marginTop: 22 }}>Couverture du programme</h2>
          {programme.map((s) => (
            <div className="card ped-subj" key={s.slug}>
              <div className="ped-subj-head">
                <span className="subject-tile" style={{ background: s.color ? `${s.color}1f` : "var(--indigo-50)", color: s.color || "var(--indigo-600)" }}><Icon name={s.icon || "book"} /></span>
                <h3>{s.name}</h3>
                <span className="ped-subj-count">{s.coveredCount}/{s.moduleCount} modules acquis · {s.studentTotal} élèves</span>
              </div>
              <div className="ped-mods">
                {s.modules.map((m) => (
                  <div className="ped-mod" key={m.id}>
                    <span className="ped-mod-n">{m.order}</span>
                    <span className="ped-mod-t">{m.title}</span>
                    <span className="ped-bar"><span style={{ width: `${m.completionPct}%`, background: barColor(m.completionPct) }} /></span>
                    <span className="ped-mod-v">{m.studentsCompleted}/{m.studentTotal}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <aside className="ped-rail">
          <div className="card panel">
            <div className="panel-head"><h3><Icon name="layers" /> Projets créés</h3></div>
            {projects.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>Aucun projet pour le moment.</p> : projects.map((p) => {
              const st = PROJ_STATUS[p.status] || PROJ_STATUS.DRAFT;
              return (
                <div className="ped-proj" key={p.id}>
                  <div className="ped-proj-top">
                    <span className="ped-proj-title">{p.title}</span>
                    <span className={`pj-pill ${st.c}`}>{st.l}</span>
                  </div>
                  <div className="ped-proj-meta">{p.subjectName} · {p.classLevel}{p.author ? ` · ${p.author}` : ""}</div>
                  <div className="ped-proj-stats">
                    <span title="Étapes"><Icon name="list" /> {p.stepCount}</span>
                    <span title="Classes assignées"><Icon name="users" /> {p.assignedCount}</span>
                    <span title="Rendus (notés)"><Icon name="check" /> {p.gradedCount}/{p.submissionCount}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </>
  );
}
