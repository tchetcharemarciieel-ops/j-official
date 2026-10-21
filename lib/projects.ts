import "server-only";
import { randomBytes } from "node:crypto";
import { adminClient } from "./supabase/admin";
import { audit } from "./audit";
import { notifyProject } from "./notify";
import { autoFix, runChecks, summarize, type CheckResult } from "./checks";
import { diffSpecs } from "./diff";
import { HttpError, type ProjectRow } from "./access";
import { parseSpec, slugify, type AppSpec } from "./spec";

export async function uniqueSlug(name: string): Promise<string> {
  const base = (slugify(name) || "logiciel").slice(0, 40).replace(/-+$/, "").padEnd(3, "x");
  const db = adminClient();
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const { data } = await db.from("projects").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${randomBytes(4).toString("hex")}`;
}

export type SavedVersion = { version: number; checks: CheckResult[]; spec: AppSpec; fixed: boolean };

/**
 * Enregistre une nouvelle version : tests automatiques, corrections sûres si besoin,
 * historique, puis mise à jour du brouillon. La version publiée n'est jamais modifiée ici.
 */
export async function saveVersion(
  project: Pick<ProjectRow, "id" | "draft_spec" | "draft_version">,
  candidate: AppSpec,
  opts: { summary: string; source: "generation" | "ai" | "rules" | "manual" | "restore" | "template"; authorId: string },
): Promise<SavedVersion> {
  const prevParsed = project.draft_spec ? parseSpec(project.draft_spec) : null;
  const previous = prevParsed?.ok ? prevParsed.spec : undefined;
  let spec = candidate;
  let checks = runChecks(spec, previous);
  let fixed = false;
  if (checks.some((c) => c.status === "fail" && c.autoFixable)) {
    spec = autoFix(spec);
    checks = runChecks(spec, previous);
    fixed = true;
  }
  const s = summarize(checks);
  const version = (project.draft_version ?? 0) + 1;
  const db = adminClient();
  const { error } = await db.from("project_versions").insert({
    project_id: project.id,
    version,
    spec,
    summary: opts.summary + (fixed ? " (corrections automatiques appliquées)" : ""),
    changes: previous ? diffSpecs(previous, spec) : [],
    test_report: { checks, summary: s, ranAt: new Date().toISOString() },
    author_id: opts.authorId,
    source: opts.source,
  });
  if (error) throw new HttpError(409, "Une autre modification vient d'être enregistrée. Rechargez la page.");
  await db
    .from("projects")
    .update({
      draft_spec: spec,
      draft_version: version,
      name: spec.name,
      status: s.failed > 0 ? "failed" : undefined,
      last_error: s.failed > 0 ? checks.filter((c) => c.status === "fail").map((c) => c.message).join(" ; ").slice(0, 1000) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", project.id);
  // Un projet non publié repasse « en test » quand ses tests passent.
  if (s.failed === 0) await db.from("projects").update({ status: "test" }).eq("id", project.id).in("status", ["preparation", "generation", "failed"]);
  await audit("version.saved", { projectId: project.id, actorId: opts.authorId, details: { version, source: opts.source, ...s } });
  await notifyProject(project.id, s.failed > 0
    ? { type: "error", title: `${spec.name} : ${s.failed} test(s) en échec (v${version})`, body: "Ouvrez l'onglet Tests pour voir l'explication et la correction proposée.", link: `/projets/${project.id}?onglet=tests` }
    : { type: "update", title: `${spec.name} : version v${version} prête`, body: opts.summary.slice(0, 300), link: `/projets/${project.id}?onglet=versions` });
  return { version, checks, spec, fixed };
}

export async function createBackup(projectId: string, label: string, actorId: string, specVersion?: number | null) {
  const db = adminClient();
  const { data: rows } = await db.from("records").select("id,entity,data,created_at,updated_at,created_by").eq("project_id", projectId).eq("is_demo", false).limit(20000);
  await db.from("backups").insert({ project_id: projectId, label, spec_version: specVersion ?? null, records: rows ?? [], record_count: rows?.length ?? 0, created_by: actorId });
  await audit("backup.created", { projectId, actorId, details: { label, count: rows?.length ?? 0 } });
}
