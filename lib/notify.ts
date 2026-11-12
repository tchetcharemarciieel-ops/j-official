import "server-only";
import { adminClient } from "./supabase/admin";
import { effectivePerms, has, type MemberRow, type Permission } from "./team";

export type NotificationType = "update" | "error" | "publish" | "team" | "info";

/** Prévient le propriétaire et les administrateurs d'un logiciel (sauf l'auteur de l'action si précisé). */
export async function notifyProject(projectId: string, n: { type: NotificationType; title: string; body?: string; link?: string; exceptUserId?: string }) {
  try {
    const db = adminClient();
    const { data: managers } = await db.from("project_members").select("user_id").eq("project_id", projectId).in("role", ["owner", "admin"]);
    const rows = (managers ?? [])
      .filter((m) => m.user_id !== n.exceptUserId)
      .map((m) => ({ user_id: m.user_id, project_id: projectId, type: n.type, title: n.title.slice(0, 160), body: (n.body ?? "").slice(0, 500), link: n.link ?? `/projets/${projectId}` }));
    if (rows.length) await db.from("notifications").insert(rows);
  } catch {
    // Une notification manquée ne doit jamais faire échouer l'action principale.
  }
}

export async function notifyUser(userId: string, n: { type: NotificationType; title: string; body?: string; link?: string; projectId?: string | null }) {
  try {
    await adminClient().from("notifications").insert({ user_id: userId, project_id: n.projectId ?? null, type: n.type, title: n.title.slice(0, 160), body: (n.body ?? "").slice(0, 500), link: n.link ?? "" });
  } catch {
    /* idem */
  }
}

/**
 * Prévient l'équipe d'un poste (ex. caisse, cuisine) : membres actifs dont le poste a l'une des
 * permissions (le propriétaire, les administrateurs et les membres sans poste sont toujours inclus).
 */
export async function notifyStaff(projectId: string, perms: Permission[], n: { type: NotificationType; title: string; body?: string; link?: string; exceptUserId?: string }) {
  try {
    const db = adminClient();
    const { data } = await db.from("project_members").select("*").eq("project_id", projectId).limit(200);
    const rows = (data ?? [])
      .filter((m) => m.status !== "suspended" && m.user_id !== n.exceptUserId && m.role !== "viewer" && has(effectivePerms(m as MemberRow), perms))
      .map((m) => ({ user_id: m.user_id, project_id: projectId, type: n.type, title: n.title.slice(0, 160), body: (n.body ?? "").slice(0, 500), link: n.link ?? "" }));
    if (rows.length) await db.from("notifications").insert(rows);
  } catch {
    /* idem */
  }
}
