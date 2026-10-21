import "server-only";
import { adminClient } from "./supabase/admin";
import { getProfile, type Profile } from "./auth";
import { parseSpec, type AppSpec, type Role } from "./spec";

export type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  sector: string;
  problem: string;
  diagnosis: unknown;
  draft_spec: unknown;
  draft_version: number;
  published_spec: unknown;
  published_version: number | null;
  status: "preparation" | "generation" | "test" | "published" | "suspended" | "failed";
  last_error: string | null;
  template_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Access = { profile: Profile; project: ProjectRow; role: Role };

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Point de contrôle unique : vérifie la session, l'appartenance au projet et le rôle.
 * Un identifiant de projet modifié dans l'URL ne donne jamais accès aux données d'un autre client.
 */
export async function getAccess(projectId: string, allowed?: Role[]): Promise<Access> {
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connexion requise.");
  if (profile.suspended) throw new HttpError(403, "Compte suspendu.");
  if (!UUID_RE.test(projectId)) throw new HttpError(404, "Projet introuvable.");
  const db = adminClient();
  const [{ data: project }, { data: member }] = await Promise.all([
    db.from("projects").select("*").eq("id", projectId).maybeSingle(),
    db.from("project_members").select("role").eq("project_id", projectId).eq("user_id", profile.id).maybeSingle(),
  ]);
  // Même réponse « introuvable » si le projet n'existe pas ou si l'utilisateur n'y a pas accès.
  if (!project || !member) throw new HttpError(404, "Projet introuvable.");
  const role = member.role as Role;
  if (allowed && !allowed.includes(role)) throw new HttpError(403, "Action non autorisée pour votre rôle.");
  return { profile, project: project as ProjectRow, role };
}

export function draftSpec(project: ProjectRow): AppSpec | null {
  const r = parseSpec(project.draft_spec);
  return r.ok ? r.spec : null;
}

export function publishedSpec(project: ProjectRow): AppSpec | null {
  const r = parseSpec(project.published_spec);
  return r.ok ? r.spec : null;
}
