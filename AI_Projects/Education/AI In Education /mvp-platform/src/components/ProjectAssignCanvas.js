"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { initials } from "@/lib/icons";
import { toast } from "@/lib/toast";
import "./ProjectAssignCanvas.css";

// Project assignment canvas: connect students → named groups → projects.
// Same dependency-free mechanics as ModuleConnector: pointer events, SVG bezier
// edges recomputed from live DOM rects, elementFromPoint drop targeting.

function bezier(x1, y1, x2, y2) {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

const SUBJECT_TILE = {
  math: { l: "M", cls: "subj-math" },
  svt: { l: "S", cls: "subj-svt" },
  physique: { l: "P", cls: "subj-physique" },
  chimie: { l: "C", cls: "subj-chimie" },
  sptic: { l: "I", cls: "subj-sptic" },
};
const tileFor = (slug) => SUBJECT_TILE[slug] || { l: (slug || "?")[0].toUpperCase(), cls: "subj-math" };
const DIFF = {
  INTRO: { label: "Intro", cls: "diff-intro" },
  INTERMEDIATE: { label: "Intermédiaire", cls: "diff-mid" },
  ADVANCED: { label: "Avancé", cls: "diff-adv" },
};

const GROUP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// A chapter counts as covered once the class is 70% of the way through it. Not 100%:
// a couple of pupils who never finish would otherwise mark every chapter unready, and
// the signal has to stay usable in a real classroom.
const READY_OK = 0.7;

/** What a group's line should say about its work, before anyone reads a label. */
function edgeState(sub) {
  if (!sub) return "idle";
  if (sub.status === "GRADED") return "graded";
  if (sub.status === "RETURNED") return "returned";
  if (sub.status === "SUBMITTED") return "sent";
  return "idle";
}
const SUB_TAG = {
  graded: { label: "corrigé", cls: "ok" },
  returned: { label: "à reprendre", cls: "warn" },
  sent: { label: "rendu", cls: "sent" },
  idle: { label: "en cours", cls: "idle" },
};

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
function defaultDue() {
  const d = new Date(Date.now() + 14 * 86400000);
  return d.toISOString().slice(0, 10);
}

async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export default function ProjectAssignCanvas({ classes, agentPanel }) {
  const [classId, setClassId] = useState(classes[0]?.id || "");
  const [data, setData] = useState(null);
  const [drag, setDrag] = useState(null); // {kind:'student'|'connect', ...}
  const [edges, setEdges] = useState([]);
  const [pending, setPending] = useState(null); // {groupId, projectId, due, warning?}
  const [renaming, setRenaming] = useState(null); // groupId
  const [busy, setBusy] = useState(false);
  const [sideOpen, setSideOpen] = useState(true); // agent panel collapsed/expanded
  // Wide mode trades canvas width for a readable assistant (the canvas then
  // scrolls horizontally); the edges recompute from live rects either way.
  const [sideWide, setSideWide] = useState(false);

  const innerRef = useRef(null);
  const groupRefs = useRef(new Map()); // groupId -> header el (edge source)
  const projectRefs = useRef(new Map()); // projectId -> card el (edge target)
  const chapterRefs = useRef(new Map()); // moduleId -> chapter node el (edge target)

  const load = useCallback(async (cid) => {
    if (!cid) return;
    const r = await fetch(`/api/teacher/projects/canvas/?classId=${cid}`);
    if (r.ok) setData(await r.json());
  }, []);
  useEffect(() => { setData(null); load(classId); }, [classId, load]);

  // studentId -> groupId
  const memberOf = new Map();
  for (const g of data?.groups || []) for (const sid of g.members) memberOf.set(sid, g.id);
  const studentById = new Map((data?.students || []).map((s) => [s.id, s]));

  // ── edges ──
  // Two kinds now. Group → project carries where that group's work stands, so the
  // colour of the line answers "who needs me" without reading a single label. Project
  // → chapter carries the prerequisite, which was in the database from the start and
  // drawn nowhere: a project resting on a chapter the class has barely opened is the
  // thing you want to see BEFORE you hand it out.
  const recompute = useCallback(() => {
    const inner = innerRef.current;
    if (!inner || !data) return;
    const ir = inner.getBoundingClientRect();
    const next = [];
    for (const g of data.groups) {
      const gEl = groupRefs.current.get(g.id);
      if (!gEl) continue;
      const gr = gEl.getBoundingClientRect();
      for (const a of g.assignments) {
        const pEl = projectRefs.current.get(a.projectId);
        if (!pEl) continue;
        const pr = pEl.getBoundingClientRect();
        const sub = g.submissions.find((s) => s.projectId === a.projectId);
        next.push({
          id: `${g.id}:${a.projectId}`,
          state: edgeState(sub),
          x1: gr.right - ir.left,
          y1: gr.top - ir.top + gr.height / 2,
          x2: pr.left - ir.left,
          y2: pr.top - ir.top + pr.height / 2,
        });
      }
    }
    for (const p of data.projects) {
      const pEl = projectRefs.current.get(p.id);
      if (!pEl) continue;
      const pr = pEl.getBoundingClientRect();
      for (const req of p.prereqs || []) {
        const cEl = chapterRefs.current.get(req.id);
        if (!cEl) continue;
        const cr = cEl.getBoundingClientRect();
        next.push({
          id: `req:${p.id}:${req.id}`,
          state: req.ready >= READY_OK ? "ready" : "thin",
          x1: pr.right - ir.left,
          y1: pr.top - ir.top + pr.height / 2,
          x2: cr.left - ir.left,
          y2: cr.top - ir.top + cr.height / 2,
        });
      }
    }
    setEdges(next);
  }, [data]);

  useLayoutEffect(() => { recompute(); }, [recompute]);
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(inner);
    window.addEventListener("resize", recompute);
    return () => { ro.disconnect(); window.removeEventListener("resize", recompute); };
  }, [recompute]);

  const toContent = useCallback((cx, cy) => {
    const ir = innerRef.current?.getBoundingClientRect();
    return { x: cx - (ir?.left || 0), y: cy - (ir?.top || 0) };
  }, []);

  // ── student drag (chip → group / roster) ──
  function startStudentDrag(e, studentId) {
    e.preventDefault();
    const p = toContent(e.clientX, e.clientY);
    setDrag({ kind: "student", studentId, x: p.x, y: p.y, hoverKey: null });
  }

  // ── connect drag (group handle → project) ──
  function startConnectDrag(e, groupId) {
    e.preventDefault();
    e.stopPropagation();
    const gEl = groupRefs.current.get(groupId);
    const ir = innerRef.current.getBoundingClientRect();
    const gr = gEl.getBoundingClientRect();
    const p = toContent(e.clientX, e.clientY);
    setDrag({
      kind: "connect", groupId,
      x1: gr.right - ir.left, y1: gr.top - ir.top + gr.height / 2,
      cx: p.x, cy: p.y, hoverProjectId: null,
    });
  }

  function targetAt(cx, cy) {
    const el = document.elementFromPoint(cx, cy);
    const group = el?.closest?.(".pc-group");
    if (group) return { kind: "group", id: group.dataset.gid };
    const project = el?.closest?.(".pc-project");
    if (project) return { kind: "project", id: project.dataset.pid };
    if (el?.closest?.(".pc-col-roster")) return { kind: "roster" };
    return null;
  }

  useEffect(() => {
    if (!drag) return;
    function move(e) {
      const p = toContent(e.clientX, e.clientY);
      const t = targetAt(e.clientX, e.clientY);
      setDrag((d) => {
        if (!d) return d;
        if (d.kind === "student") {
          return { ...d, x: p.x, y: p.y, hoverKey: t ? `${t.kind}:${t.id || ""}` : null };
        }
        return { ...d, cx: p.x, cy: p.y, hoverProjectId: t?.kind === "project" ? t.id : null };
      });
    }
    async function up(e) {
      const t = targetAt(e.clientX, e.clientY);
      const d = drag;
      setDrag(null);
      if (!t || !d) return;
      if (d.kind === "student") {
        const currentGroup = memberOf.get(d.studentId) ?? null;
        if (t.kind === "group" && t.id !== currentGroup) {
          await moveStudent(d.studentId, t.id);
        } else if (t.kind === "roster" && currentGroup) {
          await moveStudent(d.studentId, null);
        }
      } else if (d.kind === "connect" && t.kind === "project") {
        setPending({ groupId: d.groupId, projectId: t.id, due: defaultDue(), warning: null });
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── mutations (optimistic where cheap, reload after) ──
  async function moveStudent(studentId, groupId) {
    setBusy(true);
    const r = await api("POST", "/api/teacher/projects/groups/members/", { classId, studentId, groupId });
    setBusy(false);
    if (!r.ok) { toast("Déplacement impossible.", { icon: "alert" }); return; }
    await load(classId);
  }

  async function addGroup() {
    const taken = new Set((data?.groups || []).map((g) => g.name));
    let name = "";
    for (const c of GROUP_LETTERS) { if (!taken.has(`Groupe ${c}`)) { name = `Groupe ${c}`; break; } }
    if (!name) name = `Groupe ${(data?.groups?.length || 0) + 1}`;
    const r = await api("POST", "/api/teacher/projects/groups/", { classId, name });
    if (!r.ok) { toast("Création impossible.", { icon: "alert" }); return; }
    await load(classId);
  }

  async function removeGroup(groupId) {
    const r = await api("DELETE", "/api/teacher/projects/groups/", { groupId });
    if (!r.ok) {
      toast(r.status === 409 ? "Impossible : ce groupe a déjà rendu un travail." : "Suppression impossible.", { icon: "alert" });
      return;
    }
    await load(classId);
  }

  async function rename(groupId, name) {
    setRenaming(null);
    const g = data?.groups.find((x) => x.id === groupId);
    if (!g || !name.trim() || name.trim() === g.name) return;
    const r = await api("PATCH", "/api/teacher/projects/groups/", { groupId, name: name.trim() });
    if (!r.ok) toast(r.status === 409 ? "Ce nom est déjà pris." : "Renommage impossible.", { icon: "alert" });
    await load(classId);
  }

  async function confirmAssign() {
    const { groupId, projectId, due } = pending;
    setBusy(true);
    const r = await api("POST", "/api/teacher/projects/groups/assign/", { groupId, projectId, dueDate: due || null });
    setBusy(false);
    if (!r.ok) { toast("Connexion impossible.", { icon: "alert" }); setPending(null); return; }
    if (r.data.warning === "SOLO_SUBMISSIONS" && !pending.warning) {
      setPending((p) => ({ ...p, warning: r.data.students }));
    } else {
      setPending(null);
    }
    toast("Groupe connecté au projet ✓", { icon: "check" });
    await load(classId);
  }

  async function unassign(groupId, projectId) {
    const r = await api("DELETE", "/api/teacher/projects/groups/assign/", { groupId, projectId });
    if (!r.ok) {
      toast(r.status === 409 ? "Impossible : le groupe a déjà rendu ce projet." : "Déconnexion impossible.", { icon: "alert" });
      return;
    }
    await load(classId);
  }

  async function makeSolo(student) {
    const name = `Solo — ${student.firstName}`;
    const taken = (data?.groups || []).find((g) => g.name === name);
    let gid = taken?.id;
    if (!gid) {
      const r = await api("POST", "/api/teacher/projects/groups/", { classId, name });
      if (!r.ok) { toast("Création impossible.", { icon: "alert" }); return; }
      gid = r.data.id;
    }
    await api("POST", "/api/teacher/projects/groups/members/", { classId, studentId: student.id, groupId: gid });
    await load(classId);
    toast(`${name} créé — reliez-le à un projet.`, { icon: "check" });
  }

  const groupName = (gid) => data?.groups.find((g) => g.id === gid)?.name || "";
  const ungrouped = (data?.students || []).filter((s) => !memberOf.has(s.id));

  // Each chapter appears once even when several projects require it — two projects
  // pointing at the same node is the useful picture, two copies of the node is not.
  const chapters = [];
  const seenChapter = new Set();
  for (const p of data?.projects || []) {
    for (const r of p.prereqs || []) {
      if (seenChapter.has(r.id)) continue;
      seenChapter.add(r.id);
      chapters.push(r);
    }
  }

  return (
    <div className="pc-wrap">
      <div className="pc-bar">
        <div className="pc-bar-title"><Icon name="users" /> Connecteur de projets</div>
        <select className="pc-class-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={addGroup} disabled={!data}>
          <Icon name="plus" /> Nouveau groupe
        </button>
        <div className="pc-bar-hint">
          Glissez un élève dans un groupe, puis tirez la <span className="pc-dot-inline" /> du groupe vers un projet.
        </div>
      </div>

      <div className="pc-body">
        <div className="pc-scroll">
          {!data ? (
            <p className="pj-empty">Chargement…</p>
          ) : (
            <div className="pc-inner" ref={innerRef}>
              <svg className="pc-edges" width="100%" height="100%">
                <defs>
                  {/* One marker per state: an SVG marker cannot inherit the stroke of
                      the path it caps, so a shared arrowhead would stay indigo while
                      the line turned green. */}
                  {[
                    ["pc-arrow", "var(--indigo-400)"],
                    ["pc-arrow-graded", "var(--success, #15803d)"],
                    ["pc-arrow-returned", "var(--warning-fg, #b45309)"],
                    ["pc-arrow-sent", "var(--indigo-500)"],
                    ["pc-arrow-idle", "var(--border-strong)"],
                    ["pc-arrow-ready", "var(--success, #15803d)"],
                    ["pc-arrow-thin", "var(--border-strong)"],
                  ].map(([id, fill]) => (
                    <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
                    </marker>
                  ))}
                </defs>
                {edges.map((e) => (
                  <path
                    key={e.id}
                    className={`pc-edge${e.state ? ` st-${e.state}` : ""}`}
                    d={bezier(e.x1, e.y1, e.x2, e.y2)}
                    markerEnd={`url(#pc-arrow${e.state ? `-${e.state}` : ""})`}
                  />
                ))}
                {drag?.kind === "connect" && (
                  <path className="pc-edge dragging" d={bezier(drag.x1, drag.y1, drag.cx, drag.cy)} markerEnd="url(#pc-arrow)" />
                )}
              </svg>

              {/* floating ghost chip while dragging a student */}
              {drag?.kind === "student" && (
                <div className="pc-ghost" style={{ left: drag.x, top: drag.y }}>
                  {studentById.get(drag.studentId)?.firstName}
                </div>
              )}

              {/* ── roster ── */}
              <div className="pc-col pc-col-roster">
                <div className="pc-col-h">Élèves <span className="pc-count">{data.students.length}</span></div>
                {data.students.map((s) => {
                  const gid = memberOf.get(s.id);
                  return (
                    <div
                      key={s.id}
                      className={`pc-chip${gid ? " grouped" : ""}${drag?.kind === "student" && drag.studentId === s.id ? " lifting" : ""}`}
                      onPointerDown={(e) => startStudentDrag(e, s.id)}
                    >
                      <span className="pc-av" style={s.avatarColor ? { background: s.avatarColor } : undefined}>
                        {initials(`${s.firstName} ${s.lastName}`)}
                      </span>
                      <span className="pc-chip-name">{s.firstName} {s.lastName}</span>
                      {gid
                        ? <span className="pc-chip-g">{groupName(gid)}</span>
                        : <button className="pc-solo" title="Créer un groupe solo" onPointerDown={(e) => e.stopPropagation()} onClick={() => makeSolo(s)}>→ solo</button>}
                    </div>
                  );
                })}
                {ungrouped.length === 0 && <div className="pc-empty">Tous les élèves sont en groupe.</div>}
              </div>

              {/* ── groups ── */}
              <div className="pc-col pc-col-groups">
                <div className="pc-col-h">Groupes <span className="pc-count">{data.groups.length}</span></div>
                {data.groups.length === 0 && (
                  <div className="pc-empty-card">
                    <Icon name="users" />
                    <p>Créez un groupe, puis glissez-y des élèves.</p>
                  </div>
                )}
                {data.groups.map((g) => (
                  <div
                    key={g.id}
                    className={`pc-group${drag?.kind === "student" && drag.hoverKey === `group:${g.id}` ? " hover" : ""}${drag?.kind === "student" ? " targetable" : ""}`}
                    data-gid={g.id}
                  >
                    <div
                      className="pc-group-h"
                      ref={(el) => { if (el) groupRefs.current.set(g.id, el); else groupRefs.current.delete(g.id); }}
                    >
                      <span className="pc-group-ic"><Icon name="users" /></span>
                      {renaming === g.id ? (
                        <input
                          className="pc-rename"
                          defaultValue={g.name}
                          autoFocus
                          onBlur={(e) => rename(g.id, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setRenaming(null); }}
                        />
                      ) : (
                        <button className="pc-group-name" title="Renommer" onClick={() => setRenaming(g.id)}>{g.name}</button>
                      )}
                      <span className="pc-count">{g.members.length}</span>
                      <button className="pc-x" title="Supprimer le groupe" onClick={() => removeGroup(g.id)}><Icon name="x" /></button>
                      <span className="pc-handle" title="Relier à un projet" onPointerDown={(e) => startConnectDrag(e, g.id)} />
                    </div>
                    <div className="pc-group-members">
                      {g.members.length === 0 && <div className="pc-empty sm">Déposez des élèves ici.</div>}
                      {g.members.map((sid) => {
                        const s = studentById.get(sid);
                        if (!s) return null;
                        return (
                          <div key={sid} className="pc-chip in-group" onPointerDown={(e) => startStudentDrag(e, sid)}>
                            <span className="pc-av" style={s.avatarColor ? { background: s.avatarColor } : undefined}>
                              {initials(`${s.firstName} ${s.lastName}`)}
                            </span>
                            <span className="pc-chip-name">{s.firstName} {s.lastName}</span>
                          </div>
                        );
                      })}
                    </div>
                    {g.assignments.length > 0 && (
                      <div className="pc-group-links">
                        {g.assignments.map((a) => {
                          const p = data.projects.find((x) => x.id === a.projectId);
                          const sub = g.submissions.find((x) => x.projectId === a.projectId);
                          const tag = SUB_TAG[edgeState(sub)];
                          const total = p?.stepCount || 0;
                          const doneN = Math.min(sub?.stepsDone ?? 0, total);
                          return (
                            <span key={a.projectId} className="pc-link-pill" title={p?.title}>
                              <Icon name="arrowR" /> {p?.title?.slice(0, 26)}{(p?.title?.length || 0) > 26 ? "…" : ""}
                              {/* One pip per step of the project: "en cours" stops being a
                                  single word and becomes a position in the work. */}
                              {total > 0 && (
                                <span className="pc-steps" title={`${doneN} étape${doneN > 1 ? "s" : ""} sur ${total}`} aria-label={`${doneN} étapes sur ${total}`}>
                                  {Array.from({ length: total }, (_, i) => (
                                    <i key={i} className={i < doneN ? "on" : ""} />
                                  ))}
                                </span>
                              )}
                              <b className={`pc-sub-status ${tag.cls}`}>
                                {sub?.status === "GRADED" && sub.grade != null ? `${sub.grade}/100` : tag.label}
                              </b>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* ── projects ── */}
              <div className="pc-col pc-col-projects">
                <div className="pc-col-h">Projets <span className="pc-count">{data.projects.length}</span></div>
                {data.projects.length === 0 && <div className="pc-empty">Aucun projet publié pour cette classe.</div>}
                {data.projects.map((p) => {
                  const tile = tileFor(p.subjectSlug);
                  const diff = DIFF[p.difficulty] || DIFF.INTERMEDIATE;
                  const connected = data.groups.filter((g) => g.assignments.some((a) => a.projectId === p.id));
                  const isPending = pending?.projectId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`pc-project${drag?.kind === "connect" && drag.hoverProjectId === p.id ? " hover" : ""}${drag?.kind === "connect" ? " targetable" : ""}`}
                      data-pid={p.id}
                      ref={(el) => { if (el) projectRefs.current.set(p.id, el); else projectRefs.current.delete(p.id); }}
                    >
                      <span className="pc-anchor" />
                      <div className="pc-project-h">
                        <span className={`pj-tile sm ${tile.cls}`}>{tile.l}</span>
                        <div className="pc-project-t">
                          <div className="pc-project-title">{p.title}</div>
                          <div className="pc-project-meta">
                            <span className={`pj-diff ${diff.cls}`}>{diff.label}</span>
                            <span className="muted">{p.stepCount} étapes · {p.estMinutes} min</span>
                          </div>
                        </div>
                      </div>
                      {/* The chapters themselves are nodes in the next column now; the
                          card keeps only the verdict, which is what decides whether you
                          hand this project out today. */}
                      {p.prereqs.length > 0 && (() => {
                        const ok = p.prereqs.filter((r) => r.ready >= READY_OK).length;
                        const all = ok === p.prereqs.length;
                        return (
                          <div className={`pc-ready${all ? " ok" : ""}`}>
                            <Icon name={all ? "check" : "alert"} />
                            {ok}/{p.prereqs.length} chapitre{p.prereqs.length > 1 ? "s" : ""} {all ? "acquis · classe prête" : "acquis"}
                          </div>
                        );
                      })()}
                      {connected.length > 0 && (
                        <div className="pc-connected">
                          {connected.map((g) => {
                            const a = g.assignments.find((x) => x.projectId === p.id);
                            return (
                              <span className="pc-conn-pill" key={g.id}>
                                {g.name}
                                {a?.dueDate && <i>· {fmtDate(a.dueDate)}</i>}
                                <button title="Déconnecter" onClick={() => unassign(g.id, p.id)}><Icon name="x" /></button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {p.classAssigned && <div className="pc-class-note">Assigné à toute la classe{p.classDueDate ? ` · ${fmtDate(p.classDueDate)}` : ""}</div>}

                      {isPending && (
                        <div className="pc-popover" onPointerDown={(e) => e.stopPropagation()}>
                          <div className="pc-popover-t">Connecter <b>{groupName(pending.groupId)}</b></div>
                          {pending.warning && (
                            <div className="pc-warn">
                              <Icon name="alert" /> Rendu solo existant : {pending.warning.join(", ")}. Le travail de groupe prendra le dessus.
                            </div>
                          )}
                          <div className="pc-popover-row">
                            <label>Échéance</label>
                            <input type="date" value={pending.due} onChange={(e) => setPending((x) => ({ ...x, due: e.target.value }))} />
                          </div>
                          <div className="pc-popover-acts">
                            <button className="btn btn-secondary btn-sm" onClick={() => setPending(null)}>Annuler</button>
                            <button className="btn btn-primary btn-sm" disabled={busy} onClick={confirmAssign}>
                              <Icon name="check" /> Connecter
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── chapters the projects rest on ──
                  Placed AFTER the projects, not before, because the flow of this canvas
                  is students → groups → projects and reversing it would break the drag
                  everyone already knows. The arrow points from a project to what it
                  requires, and the bar says how far this class has actually got. */}
              <div className="pc-col pc-col-chapters">
                <div className="pc-col-h">Chapitres requis <span className="pc-count">{chapters.length}</span></div>
                {chapters.length === 0 && <div className="pc-empty">Aucun prérequis déclaré sur ces projets.</div>}
                {chapters.map((c) => {
                  const pct = Math.round(c.ready * 100);
                  const ok = c.ready >= READY_OK;
                  return (
                    <div
                      key={c.id}
                      className={`pc-chapter${ok ? " ok" : ""}`}
                      ref={(el) => { if (el) chapterRefs.current.set(c.id, el); else chapterRefs.current.delete(c.id); }}
                      title={`${pct}% des leçons de ce chapitre terminées par la classe`}
                    >
                      <div className="pc-chapter-t">{c.title}</div>
                      <div className="pc-chapter-bar"><i style={{ width: `${Math.max(2, pct)}%` }} /></div>
                      <div className="pc-chapter-m">{pct}% de la classe</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {agentPanel && data && (sideOpen ? (
          <aside className={`pc-side${sideWide ? " wide" : ""}`}>
            <div className="pc-side-head">
              <span className="pc-side-title"><Icon name="sparkles" /> Assistant IA</span>
              <span className="pc-side-acts">
                <button
                  className="pc-side-toggle"
                  title={sideWide ? "Réduire l’assistant" : "Agrandir l’assistant"}
                  aria-pressed={sideWide}
                  onClick={() => setSideWide((w) => !w)}
                >
                  <Icon name={sideWide ? "chevR" : "chevL"} />
                </button>
                <button className="pc-side-toggle" title="Masquer l’assistant" onClick={() => setSideOpen(false)}>
                  <Icon name="x" />
                </button>
              </span>
            </div>
            {agentPanel({ classId, projects: data.projects, onApplied: () => load(classId) })}
          </aside>
        ) : (
          <button className="pc-side-reopen" title="Afficher l’assistant IA" onClick={() => setSideOpen(true)}>
            <Icon name="chevL" />
            <Icon name="sparkles" />
            <span>Assistant</span>
          </button>
        ))}
      </div>
    </div>
  );
}
