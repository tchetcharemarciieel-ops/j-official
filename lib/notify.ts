import "server-only";
import { adminClient } from "./supabase/admin";

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
