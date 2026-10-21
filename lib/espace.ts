import "server-only";
import { adminClient } from "./supabase/admin";
import { parseSpec, type Role } from "./spec";
import type { Profile } from "./auth";

export type EspaceProject = {
  id: string;
  name: string;
  slug: string;
  description: string;
  sector: string;
  status: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  draftVersion: number;
  publishedVersion: number | null;
  primary: string;
  logoText: string;
  logoUrl: string;
  entities: { key: string; label: string; icon: string }[];
};

/**
 * Logiciels accessibles à l'utilisateur : uniquement ceux dont il est membre.
 * C'est la seule source de l'espace client — aucune donnée d'un autre compte n'y entre.
 */
export async function loadProjects(profile: Profile): Promise<EspaceProject[]> {
  const db = adminClient();
  const { data: memberships } = await db.from("project_members").select("project_id,role").eq("user_id", profile.id);
  const ids = (memberships ?? []).map((m) => m.project_id);
  if (!ids.length) return [];
  const { data } = await db
    .from("projects")
    .select("id,name,slug,sector,problem,status,created_at,updated_at,published_at,draft_version,published_version,draft_spec")
    .in("id", ids)
    .order("updated_at", { ascending: false });
  return (data ?? []).map((p) => {
    const parsed = parseSpec(p.draft_spec);
    const spec = parsed.ok ? parsed.spec : null;
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: spec?.description || p.problem || "",
      sector: p.sector,
      status: p.status,
      role: (memberships ?? []).find((m) => m.project_id === p.id)!.role as Role,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      publishedAt: p.published_at,
      draftVersion: p.draft_version,
      publishedVersion: p.published_version,
      primary: spec?.theme.primary ?? "#6d5dfc",
      logoText: spec?.theme.logoText ?? "MS",
      logoUrl: spec?.theme.logoUrl ?? "",
      entities: spec?.entities.map((e) => ({ key: e.key, label: e.labelPlural, icon: e.icon })) ?? [],
    };
  });
}

export const ACTION_LABELS: Record<string, string> = {
  "project.created": "Logiciel créé",
  "version.saved": "Nouvelle version enregistrée",
  "publish.done": "Logiciel publié",
  "publish.suspended": "Publication suspendue",
  "publish.resumed": "Publication réactivée",
  "publish.failed": "Échec de publication",
  "member.invited": "Collaborateur invité",
  "member.joined": "Nouveau membre",
  "member.revoked": "Accès retiré",
  "member.role_changed": "Rôle modifié",
  "records.imported": "Données importées",
  "record.deleted": "Fiche supprimée",
  "backup.created": "Sauvegarde créée",
  "backup.restored": "Sauvegarde restaurée",
  "integration.created": "Intégration ajoutée",
  "integration.tested": "Intégration testée",
  "data.exported": "Données exportées",
  "diagnose.failed": "Échec d'analyse",
  "modify.failed": "Échec de modification",
};

export async function loadActivity(projectIds: string[], limit = 15) {
  if (!projectIds.length) return [];
  const { data } = await adminClient().from("audit_logs").select("action,level,project_id,created_at,details").in("project_id", projectIds).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((a) => ({ ...a, label: ACTION_LABELS[a.action] ?? a.action }));
}
