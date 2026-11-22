"use client";

import { FolderKanban, ListChecks, MessageSquare, Paperclip, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PRIORITIES, PROJECT_STATUS, TASK_STATUS, projectLate, projectProgress, taskLate, today, type Comment, type Doc, type Document, type Project, type ProjectStatus, type Task, type TaskStatus } from "@/lib/bureau/model";
import { useCtx } from "../context";
import { Badge, DeleteButton, Empty, Field, Modal, MultiPick, Pick, SearchBox, StatusBadge, Tabs, fmtDate, timeFmt, useFilePick } from "../ui";

const bar = (pct: number, late = false) => (
  <span className="block h-2 overflow-hidden rounded-full bg-slate-200"><span className={`block h-2 rounded-full ${late ? "bg-red-500" : "bg-[var(--brand)]"}`} style={{ width: `${pct}%` }} /></span>
);

/** Projets et tâches : responsable, collaborateurs, dates limites, avancement, commentaires, fichiers, retards. */
export function Projects() {
  const c = useCtx();
  const [tab, setTab] = useState<"projects" | "tasks">("projects");
  const [filter, setFilter] = useState<"all" | "en_cours" | "termine" | "retard">("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Doc<Project> | "new" | null>(null);
  const [open, setOpen] = useState<string | null>(c.focus);
  useEffect(() => setOpen(c.focus), [c.focus]);
  const projects = c.data.project as Doc<Project>[];
  const tasks = c.data.task as Doc<Task>[];
  const day = today();
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return projects
      .filter((p) => (filter === "all" ? true : filter === "retard" ? projectLate(p.data, day) : p.data.status === filter))
      .filter((p) => !n || p.data.name.toLowerCase().includes(n) || c.clientName(p.data.client_id).toLowerCase().includes(n))
      .sort((a, b) => (a.data.due ?? "9999").localeCompare(b.data.due ?? "9999"));
  }, [projects, filter, q, day, c]);
  const mine = tasks.filter((t) => t.data.assignee === c.s.me && t.data.status !== "termine");
  const sel = projects.find((p) => p.id === open);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={setTab} items={[["projects", `Projets (${projects.length})`], ["tasks", `Tâches (${tasks.length})`]]} />
        <div className="min-w-[10rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder="Rechercher un projet ou un client…" /></div>
        {c.s.can.manager && <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Nouveau projet</button>}
      </div>
      {tab === "projects" && (
        <>
          <Tabs value={filter} onChange={setFilter} items={[["all", "Tous"], ["en_cours", "En cours"], ["retard", `En retard (${projects.filter((p) => projectLate(p.data, day)).length})`], ["termine", "Terminés"]]} />
          {rows.length === 0 ? (
            <Empty icon={FolderKanban} title={projects.length ? "Aucun projet sur cette sélection" : "Aucun projet"} text={!projects.length ? (c.s.can.manager ? "Créez un projet, attribuez un responsable et des collaborateurs, puis ajoutez des tâches." : "Aucun projet ne vous est attribué pour le moment.") : undefined} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((p) => {
                const pct = projectProgress(p.data, tasks, p.id);
                const late = projectLate(p.data, day);
                return (
                  <button key={p.id} onClick={() => setOpen(p.id)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow">
                    <span className="flex items-start justify-between gap-2"><span className="font-medium">{p.data.name}</span><StatusBadge k={p.data.status} label={PROJECT_STATUS[p.data.status]} /></span>
                    <span className="mt-1 block text-xs text-slate-500">{p.data.client_id ? `${c.clientName(p.data.client_id)} · ` : ""}Responsable : {c.memberName(p.data.owner)}</span>
                    <span className="mt-3 block">{bar(pct, late)}</span>
                    <span className="mt-1 flex items-center justify-between text-xs text-slate-500"><span>{pct} %</span><span className={late ? "font-medium text-red-600" : ""}>{p.data.due ? `Échéance ${fmtDate(p.data.due)}${late ? " (en retard)" : ""}` : "Sans échéance"}</span></span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      {tab === "tasks" && <AllTasks mine={mine.length} />}
      {edit && <ProjectForm project={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {sel && <ProjectView project={sel} onClose={() => setOpen(null)} onEdit={() => (setOpen(null), setEdit(sel))} />}
    </div>
  );
}

function AllTasks({ mine }: { mine: number }) {
  const c = useCtx();
  const [f, setF] = useState<"mine" | "all" | "late" | "done">(mine ? "mine" : "all");
  const [edit, setEdit] = useState<Doc<Task> | "new" | null>(null);
  const tasks = (c.data.task as Doc<Task>[]).filter((t) => (f === "mine" ? t.data.assignee === c.s.me && t.data.status !== "termine" : f === "late" ? taskLate(t.data) : f === "done" ? t.data.status === "termine" : t.data.status !== "termine")).sort((a, b) => (a.data.due ?? "9999").localeCompare(b.data.due ?? "9999"));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={f} onChange={setF} items={[["mine", "Mes tâches"], ["all", "Ouvertes"], ["late", "En retard"], ["done", "Terminées"]]} />
        <button className="btn btn-ghost ml-auto" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Nouvelle tâche</button>
      </div>
      {tasks.length === 0 ? <Empty icon={ListChecks} title="Aucune tâche sur cette sélection" /> : <TaskList tasks={tasks} onEdit={setEdit} showProject />}
      {edit && <TaskForm task={edit === "new" ? null : edit} projectId={null} onClose={() => setEdit(null)} />}
    </div>
  );
}

function TaskList({ tasks, onEdit, showProject }: { tasks: Doc<Task>[]; onEdit: (t: Doc<Task>) => void; showProject?: boolean }) {
  const c = useCtx();
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm shadow-sm">
      {tasks.map((t) => {
        const late = taskLate(t.data);
        const p = showProject && t.data.project_id ? (c.data.project as Doc<Project>[]).find((x) => x.id === t.data.project_id) : null;
        const canMove = c.s.can.manager || t.data.assignee === c.s.me || t.data.created_by === c.s.me;
        return (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <input type="checkbox" className="h-5 w-5" checked={t.data.status === "termine"} disabled={!canMove} onChange={(e) => void c.run("task.status", { id: t.id, status: e.target.checked ? "termine" : "a_faire" }, { quiet: true })} aria-label={`Terminer « ${t.data.title} »`} />
            <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(t)}>
              <span className={`block truncate font-medium ${t.data.status === "termine" ? "text-slate-400 line-through" : ""}`}>{t.data.title}</span>
              <span className="block truncate text-xs text-slate-500">{[p?.data.name, t.data.assignee ? c.memberName(t.data.assignee) : "Non assignée", t.data.due ? `avant le ${fmtDate(t.data.due)}` : ""].filter(Boolean).join(" · ")}</span>
            </button>
            <span className="flex flex-col items-end gap-1">
              <StatusBadge k={t.data.status} label={TASK_STATUS[t.data.status]} />
              {late && <Badge tone="red">En retard</Badge>}
              {!late && (t.data.priority === "haute" || t.data.priority === "urgente") && <Badge tone={t.data.priority === "urgente" ? "red" : "amber"}>{PRIORITIES[t.data.priority]}</Badge>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ProjectForm({ project, onClose }: { project: Doc<Project> | null; onClose: () => void }) {
  const c = useCtx();
  const d = project?.data;
  const [f, setF] = useState({ name: d?.name ?? "", client_id: d?.client_id ?? "", owner: d?.owner ?? "", members: d?.members ?? ([] as string[]), start: d?.start ?? "", due: d?.due ?? "", status: d?.status ?? ("planifie" as ProjectStatus), progress: String(d?.progress ?? 0), budget: d?.budget === null || d?.budget === undefined ? "" : String(d.budget), description: d?.description ?? "" });
  const team: [string, string][] = c.s.members.filter((m) => m.active).map((m) => [m.id, m.name]);
  const clients: [string, string][] = (c.data.client as Doc<{ name: string }>[]).map((x) => [x.id, x.data.name]);
  const hasTasks = project ? (c.data.task as Doc<Task>[]).some((t) => t.data.project_id === project.id) : false;
  return (
    <Modal wide title={project ? "Modifier le projet" : "Nouveau projet"} onClose={onClose} footer={
      <>
        {project && <DeleteButton confirmText={`Supprimer « ${project.data.name} » avec ses tâches et ses commentaires ?`} onConfirm={async () => (await c.run("project.delete", { id: project.id })) && onClose()} />}
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!f.name.trim()} onClick={async () => (await c.run("project.save", { id: project?.id, ...f, client_id: f.client_id || null, owner: f.owner || null, start: f.start || null, due: f.due || null, budget: f.budget || null })) && onClose()}>Enregistrer</button>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom du projet" className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} autoFocus /></Field>
        <Pick label="Client" value={f.client_id} onChange={(v) => setF({ ...f, client_id: v })} options={clients} empty="Aucun client" />
        <Pick label="Responsable" value={f.owner} onChange={(v) => setF({ ...f, owner: v })} options={team} empty="Aucun" />
        <Field label="Début"><input className="input" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Date limite"><input className="input" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        <Field label="Statut"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ProjectStatus })}>{Object.entries(PROJECT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Budget (facultatif)"><input className="input" inputMode="decimal" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
        <div className="sm:col-span-2"><MultiPick label="Collaborateurs" value={f.members} onChange={(v) => setF({ ...f, members: v })} options={team} /></div>
        {!hasTasks && <Field label={`Avancement saisi (${f.progress} %)`} hint="Dès que des tâches existent, l'avancement se calcule tout seul."><input type="range" min={0} max={100} value={f.progress} onChange={(e) => setF({ ...f, progress: e.target.value })} className="w-full" /></Field>}
        <Field label="Description" className="sm:col-span-2"><textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} /></Field>
      </div>
    </Modal>
  );
}

function TaskForm({ task, projectId, onClose }: { task: Doc<Task> | null; projectId: string | null; onClose: () => void }) {
  const c = useCtx();
  const d = task?.data;
  const [f, setF] = useState({ project_id: d?.project_id ?? projectId ?? "", title: d?.title ?? "", description: d?.description ?? "", assignee: d?.assignee ?? (c.s.can.manager ? "" : c.s.me), due: d?.due ?? "", status: d?.status ?? ("a_faire" as TaskStatus), priority: d?.priority ?? "normale" });
  const team: [string, string][] = c.s.members.filter((m) => m.active && (c.s.can.manager || m.id === c.s.me)).map((m) => [m.id, m.name]);
  const projects: [string, string][] = (c.data.project as Doc<Project>[]).map((p) => [p.id, p.data.name]);
  const canDelete = task && (c.s.can.manager || task.data.created_by === c.s.me);
  return (
    <Modal title={task ? "Modifier la tâche" : "Nouvelle tâche"} onClose={onClose} footer={
      <>
        {canDelete && <DeleteButton confirmText="Supprimer cette tâche ?" onConfirm={async () => (await c.run("task.delete", { id: task!.id })) && onClose()} />}
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!f.title.trim()} onClick={async () => (await c.run("task.save", { id: task?.id, ...f, project_id: f.project_id || null, assignee: f.assignee || null, due: f.due || null })) && onClose()}>Enregistrer</button>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titre" className="sm:col-span-2"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} autoFocus /></Field>
        <Pick label="Projet" value={f.project_id} onChange={(v) => setF({ ...f, project_id: v })} options={projects} empty="Sans projet" />
        <Pick label="Assignée à" value={f.assignee} onChange={(v) => setF({ ...f, assignee: v })} options={team} empty="Personne" />
        <Field label="Date limite"><input className="input" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        <Field label="Priorité"><select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as typeof f.priority })}>{Object.entries(PRIORITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Statut"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as TaskStatus })}>{Object.entries(TASK_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Description" className="sm:col-span-2"><textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} /></Field>
      </div>
    </Modal>
  );
}

function ProjectView({ project, onClose, onEdit }: { project: Doc<Project>; onClose: () => void; onEdit: () => void }) {
  const c = useCtx();
  const [tab, setTab] = useState<"tasks" | "comments" | "files">("tasks");
  const [taskEdit, setTaskEdit] = useState<Doc<Task> | "new" | null>(null);
  const [text, setText] = useState("");
  const { pick, busy } = useFilePick();
  const p = project.data;
  const tasks = (c.data.task as Doc<Task>[]).filter((t) => t.data.project_id === project.id);
  const comments = (c.data.comment as Doc<Comment>[]).filter((x) => x.data.target === "project" && x.data.target_id === project.id).sort((a, b) => b.data.at.localeCompare(a.data.at));
  const files = (c.data.document as Doc<Document>[]).filter((x) => x.data.project_id === project.id);
  const pct = projectProgress(p, c.data.task as Doc<Task>[], project.id);
  const late = projectLate(p);
  const isOwner = c.s.can.manager || p.owner === c.s.me;
  return (
    <Modal wide title={p.name} onClose={onClose} footer={c.s.can.manager ? <button className="btn btn-ghost" onClick={onEdit}>Modifier le projet</button> : undefined}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge k={p.status} label={PROJECT_STATUS[p.status]} />
          {late && <Badge tone="red">En retard</Badge>}
          {isOwner && p.status !== "termine" && <button className="btn btn-ghost !py-1 text-xs" onClick={() => void c.run("project.status", { id: project.id, status: "termine" })}>Marquer terminé</button>}
          {isOwner && p.status === "termine" && <button className="btn btn-ghost !py-1 text-xs" onClick={() => void c.run("project.status", { id: project.id, status: "en_cours" })}>Rouvrir</button>}
          <button className="btn btn-ghost !py-1 text-xs" onClick={() => (onClose(), c.go("messagerie", `project:${project.id}`))}><MessageSquare className="h-4 w-4" /> Discussion</button>
        </div>
        <div className="grid gap-2 text-slate-600 sm:grid-cols-2">
          <p>Client : <b>{p.client_id ? c.clientName(p.client_id) : "—"}</b></p>
          <p>Responsable : <b>{c.memberName(p.owner)}</b></p>
          <p>Du {fmtDate(p.start)} au {fmtDate(p.due)}</p>
          <p>Équipe : {p.members.length ? p.members.map((m) => c.memberName(m)).join(", ") : "—"}</p>
          {p.budget !== null && <p>Budget : {c.fmt(p.budget)}</p>}
        </div>
        {p.description && <p className="rounded-xl bg-slate-50 p-3">{p.description}</p>}
        <div><div className="mb-1 flex justify-between text-xs text-slate-500"><span>Avancement</span><span>{pct} %</span></div>{bar(pct, late)}</div>
        <Tabs value={tab} onChange={setTab} items={[["tasks", `Tâches (${tasks.length})`], ["comments", `Commentaires (${comments.length})`], ["files", `Fichiers (${files.length})`]]} />
        {tab === "tasks" && (
          <div className="space-y-2">
            <button className="btn btn-ghost !py-1.5" onClick={() => setTaskEdit("new")}><Plus className="h-4 w-4" /> Ajouter une tâche</button>
            {tasks.length ? <TaskList tasks={tasks} onEdit={setTaskEdit} /> : <p className="text-slate-500">Aucune tâche.</p>}
          </div>
        )}
        {tab === "comments" && (
          <div className="space-y-3">
            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await c.run("comment.add", { target: "project", target_id: project.id, text }, { quiet: true })) setText(""); }}>
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ajouter un commentaire…" maxLength={2000} aria-label="Commentaire" />
              <button className="btn btn-primary" disabled={!text.trim()}>Publier</button>
            </form>
            {comments.map((m) => (
              <div key={m.id} className="rounded-xl bg-slate-50 p-3">
                <p className="flex justify-between text-xs text-slate-500"><span><b>{c.memberName(m.data.by)}</b> · {timeFmt(m.data.at)}</span>{(c.s.can.manager || m.data.by === c.s.me) && <button className="hover:text-red-600" onClick={() => void c.run("comment.delete", { id: m.id }, { quiet: true })} aria-label="Supprimer le commentaire"><Trash2 className="h-3.5 w-3.5" /></button>}</p>
                <p className="mt-1 whitespace-pre-wrap">{m.data.text}</p>
              </div>
            ))}
            {!comments.length && <p className="text-slate-500">Aucun commentaire.</p>}
          </div>
        )}
        {tab === "files" && (
          <div className="space-y-2">
            {c.may("documents") ? (
              <label className="btn btn-ghost cursor-pointer !py-1.5"><Paperclip className="h-4 w-4" /> {busy ? "Lecture…" : "Joindre un fichier"}
                <input type="file" className="sr-only" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const r = await pick(file);
                  if (r) await c.run("document.add", { name: file.name, category: "autre", project_id: project.id, file: r });
                }} />
              </label>
            ) : <p className="text-xs text-slate-500">Les fichiers joints sont gérés par les postes « Documents ».</p>}
            {files.map((x) => <p key={x.id} className="flex justify-between gap-2 border-b border-slate-100 py-1.5"><a className="text-[var(--brand)] underline" href={c.fileUrl(x.data.file_id)!} target="_blank" rel="noopener noreferrer">{x.data.name}</a><span className="text-xs text-slate-500">{fmtDate(x.data.at)} · {c.memberName(x.data.by)}</span></p>)}
            {!files.length && <p className="text-slate-500">Aucun fichier joint.</p>}
          </div>
        )}
      </div>
      {taskEdit && <TaskForm task={taskEdit === "new" ? null : taskEdit} projectId={project.id} onClose={() => setTaskEdit(null)} />}
    </Modal>
  );
}
