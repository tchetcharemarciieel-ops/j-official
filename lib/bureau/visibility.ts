import { has, type Permission } from "../team";
import { LEVEL, type BureauData, type BureauRole, type Doc, type Message, type Project, type Task, type Comment, type Attendance, type Employee } from "./model";

/**
 * Données renvoyées à une personne selon son rôle et son poste. Le serveur filtre ici : l'interface
 * n'est jamais seule à décider de ce qu'on peut voir. Un employé ne voit que ses projets, ses tâches,
 * ses conversations et ses présences ; la messagerie privée n'est lisible que par ses deux personnes.
 */
export function visibleData(data: BureauData, me: string, role: BureauRole, perms: Permission[] | null): BureauData {
  const mgr = LEVEL[role] >= 2;
  const out: BureauData = { ...data, file: [], counter: [] };
  const may = (p: Permission | Permission[]) => has(perms, p);
  const mineProject = (d: Doc<Project>) => d.data.owner === me || d.data.members.includes(me) || d.data.created_by === me;

  out.client = may(["clients", "agenda", "documents", "projets", "finances", "metier", "rapports"]) ? data.client : [];
  out.interaction = may("clients") ? data.interaction : [];

  const projects = (data.project as Doc<Project>[]).filter((p) => mgr || may("personnel") || mineProject(p));
  out.project = may(["projets", "rapports", "personnel"]) ? projects : [];
  const visibleIds = new Set(out.project.map((p) => p.id));
  out.task = (data.task as Doc<Task>[]).filter((t) => (mgr || may("personnel") ? true : t.data.assignee === me || t.data.created_by === me || (t.data.project_id !== null && visibleIds.has(t.data.project_id)))).filter(() => may(["projets", "rapports", "personnel"]));
  const taskIds = new Set(out.task.map((t) => t.id));
  out.comment = (data.comment as Doc<Comment>[]).filter((c) => (c.data.target === "project" ? visibleIds.has(c.data.target_id) : c.data.target === "task" ? taskIds.has(c.data.target_id) : may("clients")));

  out.employee = may(["personnel", "parametres", "equipements"]) ? data.employee : (data.employee as Doc<Employee>[]).filter((e) => e.data.user_id === me);
  out.attendance = may("personnel") ? data.attendance : (data.attendance as Doc<Attendance>[]).filter((a) => out.employee.some((e) => e.id === a.data.employee_id));
  out.appointment = may("agenda") ? data.appointment : data.appointment.filter((a) => (a.data as { participants?: string[] }).participants?.includes(me));

  const docs = may(["documents", "finances"]);
  out.quote = docs ? data.quote : [];
  out.invoice = docs ? data.invoice : [];
  out.contract = may("documents") ? data.contract : [];
  out.document = may("documents") ? data.document : [];
  out.transaction = may(["finances", "rapports"]) ? data.transaction : [];
  out.equipment = may(["equipements", "personnel"]) ? data.equipment : [];
  out.record = may("metier") ? data.record : [];

  out.message = (data.message as Doc<Message>[]).filter((m) => {
    const ch = m.data.channel;
    if (ch === "general") return true;
    if (ch.startsWith("dm:")) return ch.split(":").slice(1).includes(me);
    if (ch.startsWith("project:")) return visibleIds.has(ch.slice(8));
    return false;
  });
  return out;
}

/** Collections qu'un fichier peut servir : le fichier suit les droits du document qui le contient. */
export function fileAllowed(perms: Permission[] | null, logoId: string | null, fileId: string) {
  return fileId === logoId || has(perms, ["documents", "projets", "clients"]);
}
