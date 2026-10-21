import "server-only";
import { adminClient } from "./supabase/admin";

export async function audit(action: string, opts: { projectId?: string | null; actorId?: string | null; level?: "info" | "warning" | "error"; details?: Record<string, unknown> } = {}) {
  try {
    await adminClient().from("audit_logs").insert({
      action,
      project_id: opts.projectId ?? null,
      actor_id: opts.actorId ?? null,
      level: opts.level ?? "info",
      details: opts.details ?? {},
    });
  } catch {
    // La journalisation ne doit jamais faire échouer l'action principale.
  }
}
