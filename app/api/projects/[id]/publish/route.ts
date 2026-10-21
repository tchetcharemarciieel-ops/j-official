import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { draftSpec, getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { runChecks, summarize } from "@/lib/checks";
import { audit } from "@/lib/audit";
import { SITE_URL } from "@/lib/config";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  const { action } = z.object({ action: z.enum(["publish", "suspend", "resume"]) }).parse(await readJson(req));
  const db = adminClient();

  if (action === "suspend") {
    if (project.status !== "published") throw new HttpError(409, "Le logiciel n'est pas publié.");
    await db.from("projects").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("id", id);
    await audit("publish.suspended", { projectId: id, actorId: profile.id, level: "warning" });
    return NextResponse.json({ status: "suspended" });
  }

  if (action === "resume") {
    if (project.status !== "suspended" || !project.published_spec) throw new HttpError(409, "Aucune publication suspendue à réactiver.");
    await db.from("projects").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", id);
    await audit("publish.resumed", { projectId: id, actorId: profile.id });
    return NextResponse.json({ status: "published", url: `${SITE_URL}/apps/${project.slug}` });
  }

  // Publication (ou republication des modifications)
  const { data: plan } = await db.from("plans").select("can_publish,name").eq("id", profile.plan).single();
  if (!profile.is_admin && !plan?.can_publish) throw new HttpError(402, `La publication n'est pas incluse dans la formule ${plan?.name ?? "actuelle"}. Passez à la formule Pro.`);
  const spec = draftSpec(project);
  if (!spec) throw new HttpError(409, "Le logiciel n'a pas encore été généré.");
  const s = summarize(runChecks(spec));
  if (s.failed > 0) {
    await db.from("projects").update({ status: "failed", last_error: "Publication bloquée : des tests échouent." }).eq("id", id);
    throw new HttpError(422, `Publication bloquée : ${s.failed} test(s) en échec. Corrigez-les dans l'onglet Tests.`);
  }
  const now = new Date().toISOString();
  const { error } = await db
    .from("projects")
    .update({ published_spec: spec, published_version: project.draft_version, status: "published", published_at: now, last_error: null, updated_at: now })
    .eq("id", id)
    .eq("draft_version", project.draft_version);
  if (error) {
    await audit("publish.failed", { projectId: id, actorId: profile.id, level: "error", details: { message: error.message } });
    throw new HttpError(500, "Échec de la publication. Aucune modification n'a été mise en ligne.");
  }
  await db.from("project_versions").update({ published: true }).eq("project_id", id).eq("version", project.draft_version);

  // Vérification : relecture de l'état publié en base
  const { data: check } = await db.from("projects").select("status,published_version").eq("id", id).single();
  if (check?.status !== "published" || check.published_version !== project.draft_version) throw new HttpError(500, "La publication n'a pas pu être vérifiée. Réessayez.");
  await audit("publish.done", { projectId: id, actorId: profile.id, details: { version: project.draft_version } });
  return NextResponse.json({ status: "published", version: project.draft_version, url: `${SITE_URL}/apps/${project.slug}` });
});
