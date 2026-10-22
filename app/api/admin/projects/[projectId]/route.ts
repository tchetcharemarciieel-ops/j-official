import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { draftSpec, HttpError, type ProjectRow } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { adminAudit, assertAdminApi } from "@/lib/admin";
import { runChecks, summarize } from "@/lib/checks";
import { notifyProject } from "@/lib/notify";
import { saveVersion } from "@/lib/projects";
import { parseSpec } from "@/lib/spec";

type Ctx = { params: Promise<{ projectId: string }> };

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish") }),
  z.object({ action: z.literal("unpublish") }),
  z.object({ action: z.literal("suspend"), reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("restore"), version: z.number().int().min(1) }),
]);

/**
 * Actions de la plateforme sur un mini-logiciel : publier le brouillon, dépublier, suspendre,
 * réactiver, restaurer une version. Les données métier ne sont jamais effacées.
 */
export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new HttpError(404, "Projet introuvable.");
  const input = body.parse(await readJson(req));
  const db = adminClient();
  const { data } = await db.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!data) throw new HttpError(404, "Projet introuvable.");
  const project = data as ProjectRow;
  const now = new Date().toISOString();

  switch (input.action) {
    case "publish": {
      const spec = draftSpec(project);
      if (!spec) throw new HttpError(409, "Le logiciel n'a pas encore été généré.");
      const s = summarize(runChecks(spec));
      if (s.failed > 0) throw new HttpError(422, `Publication impossible : ${s.failed} test(s) en échec.`);
      const { error } = await db.from("projects").update({ published_spec: spec, published_version: project.draft_version, status: "published", published_at: now, last_error: null, updated_at: now }).eq("id", projectId).eq("draft_version", project.draft_version);
      if (error) throw new HttpError(500, "Échec de la publication.");
      await db.from("project_versions").update({ published: true }).eq("project_id", projectId).eq("version", project.draft_version);
      await notifyProject(projectId, { type: "publish", title: `${project.name} : version v${project.draft_version} publiée par l'administration`, link: `/projets/${projectId}?onglet=publication` });
      break;
    }
    case "unpublish": {
      if (!project.published_spec) throw new HttpError(409, "Ce logiciel n'est pas publié.");
      await db.from("projects").update({ published_spec: null, published_version: null, published_at: null, status: "test", updated_at: now }).eq("id", projectId);
      await notifyProject(projectId, { type: "publish", title: `${project.name} : publication retirée par l'administration`, body: "Le lien n'est plus accessible ; le brouillon et les données sont conservés.", link: `/projets/${projectId}?onglet=publication` });
      break;
    }
    case "suspend": {
      if (project.status !== "published") throw new HttpError(409, "Seul un logiciel publié peut être suspendu.");
      await db.from("projects").update({ status: "suspended", last_error: input.reason ? `Suspendu par l'administration : ${input.reason}` : "Suspendu par l'administration", updated_at: now }).eq("id", projectId);
      await notifyProject(projectId, { type: "error", title: `${project.name} : suspendu par l'administration`, body: input.reason ?? "Contactez l'assistance MiniSoft RCA.", link: `/projets/${projectId}` });
      break;
    }
    case "resume": {
      if (project.status !== "suspended" || !project.published_spec) throw new HttpError(409, "Aucune publication suspendue à réactiver.");
      await db.from("projects").update({ status: "published", last_error: null, updated_at: now }).eq("id", projectId);
      await notifyProject(projectId, { type: "publish", title: `${project.name} : publication réactivée`, link: `/projets/${projectId}` });
      break;
    }
    case "restore": {
      const { data: v } = await db.from("project_versions").select("spec").eq("project_id", projectId).eq("version", input.version).maybeSingle();
      if (!v) throw new HttpError(404, "Version introuvable.");
      const parsed = parseSpec(v.spec);
      if (!parsed.ok) throw new HttpError(409, "Cette version n'est plus compatible avec le moteur actuel.");
      await saveVersion(project, parsed.spec, { summary: `Restauration de la version ${input.version} par l'administration`, source: "restore", authorId: admin.id });
      break;
    }
  }
  await adminAudit(admin, `project_${input.action}`, { name: project.name, ...("version" in input ? { version: input.version } : {}), ...("reason" in input && input.reason ? { reason: input.reason } : {}) }, projectId);
  return NextResponse.json({ ok: true });
});
