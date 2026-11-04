import "server-only";
import { has } from "./team";
import { adminClient } from "./supabase/admin";
import { draftSpec, getAccess, HttpError, publishedSpec, type Access } from "./access";
import { findEntity, can, readonlyFields, type Action } from "./permissions";
import { audit } from "./audit";
import { sendWebhook } from "./webhooks";
import type { AppSpec, Entity } from "./spec";

export type Mode = "demo" | "live";

export type AppContext = Access & { spec: AppSpec; mode: Mode };

/**
 * Contexte d'accès aux données d'un mini-logiciel.
 * - demo : brouillon + données de démonstration (propriétaire et administrateurs).
 * - live : version publiée + données réelles (tous les membres, selon leur rôle).
 */
export async function appContext(projectId: string, mode: Mode): Promise<AppContext> {
  const access = await getAccess(projectId);
  if (mode === "demo") {
    if (access.role !== "owner" && access.role !== "admin") throw new HttpError(403, "L'aperçu est réservé au propriétaire et aux administrateurs.");
    const spec = draftSpec(access.project);
    if (!spec) throw new HttpError(409, "Le logiciel n'a pas encore été généré.");
    return { ...access, spec, mode };
  }
  const spec = publishedSpec(access.project);
  if (!spec) throw new HttpError(409, "Ce logiciel n'est pas encore publié.");
  if (access.project.status === "suspended" && access.role !== "owner" && access.role !== "admin") throw new HttpError(423, "Ce logiciel est suspendu par son propriétaire.");
  return { ...access, spec, mode };
}

/**
 * Tables de données du logiciel (interface classique, import, questions sur les données) :
 * réservées aux postes qui ont la permission « Interface classique ».
 */
export function requireData(ctx: AppContext) {
  if (!has(ctx.perms, "donnees")) throw new HttpError(403, "Les tables de données ne font pas partie de votre poste : demandez à votre responsable.");
}

export function requireEntity(ctx: AppContext, key: string, action: Action): Entity {
  requireData(ctx);
  const entity = findEntity(ctx.spec, key);
  if (!entity) throw new HttpError(404, "Table introuvable.");
  if (!can(entity, ctx.role, action)) throw new HttpError(403, "Votre rôle ne permet pas cette action.");
  return entity;
}

/** Retire les champs protégés pour ce rôle (ex. prix non modifiables par un employé). */
export function stripReadonly(entity: Entity, ctx: AppContext, input: Record<string, unknown>) {
  const ro = new Set(readonlyFields(entity, ctx.role));
  return Object.fromEntries(Object.entries(input).filter(([k]) => !ro.has(k)));
}

export async function afterChange(ctx: AppContext, entity: Entity, event: "created" | "updated" | "deleted", recordId: string, before: unknown, after: unknown) {
  const db = adminClient();
  await db.from("record_history").insert({
    project_id: ctx.project.id,
    record_id: recordId,
    entity: entity.key,
    action: event === "created" ? "create" : event === "updated" ? "update" : "delete",
    before: ctx.mode === "live" ? before : null,
    after: ctx.mode === "live" ? after : null,
    actor_id: ctx.profile.id,
  });
  if (ctx.mode !== "live") return;
  if (event === "deleted") await audit("record.deleted", { projectId: ctx.project.id, actorId: ctx.profile.id, details: { entity: entity.key, recordId } });
  const autos = ctx.spec.automations.filter((a) => a.enabled && a.trigger.entity === entity.key && a.trigger.event === event);
  for (const a of autos) {
    if (a.action.type === "journal") {
      await audit("automation.journal", { projectId: ctx.project.id, actorId: ctx.profile.id, details: { automation: a.label, entity: entity.key, event, recordId } });
      continue;
    }
    const { data: integ } = await db.from("integrations").select("config,status").eq("id", a.action.integrationId ?? "").eq("project_id", ctx.project.id).maybeSingle();
    if (!integ || integ.status !== "connected") continue;
    const res = await sendWebhook(integ.config.url, { type: `${entity.key}.${event}`, app: ctx.project.slug, automation: a.label, record: { id: recordId, ...(after as object) }, sentAt: new Date().toISOString() });
    if (!res.ok) await audit("automation.failed", { projectId: ctx.project.id, level: "warning", details: { automation: a.label, error: res.error } });
  }
}
