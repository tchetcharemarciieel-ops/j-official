import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { composeSpec, diagnosisSchema } from "@/lib/generator";
import { getTemplate } from "@/lib/templates";
import { getSetting } from "@/lib/settings";
import { saveVersion, uniqueSlug } from "@/lib/projects";
import { audit } from "@/lib/audit";

const body = z.union([
  z.object({ diagnosis: diagnosisSchema, problem: z.string().max(4000) }),
  z.object({ templateId: z.string().max(40), name: z.string().trim().min(2).max(80) }),
]);

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connexion requise.");
  const input = body.parse(await readJson(req));
  const db = adminClient();

  // Quota de projets selon la formule
  const [{ data: plan }, { count }] = await Promise.all([
    db.from("plans").select("max_projects,name").eq("id", profile.plan).single(),
    db.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", profile.id),
  ]);
  if (!profile.is_admin && plan && (count ?? 0) >= plan.max_projects)
    throw new HttpError(402, `Votre formule ${plan.name} permet ${plan.max_projects} logiciel(s). Passez à une formule supérieure pour en créer d'autres.`);

  let spec, problem, diagnosis, templateId: string | null = null, sector;
  if ("diagnosis" in input) {
    if (!input.diagnosis.features.some((f) => f.selected)) throw new HttpError(400, "Sélectionnez au moins une fonctionnalité.");
    spec = composeSpec(input.diagnosis);
    problem = input.problem;
    diagnosis = input.diagnosis;
    sector = input.diagnosis.sectorLabel;
  } else {
    const tpl = getTemplate(input.templateId);
    if (!tpl || (await getSetting("templates")).disabled.includes(tpl.id)) throw new HttpError(404, "Modèle introuvable ou désactivé.");
    spec = { ...tpl.build(), name: input.name };
    problem = tpl.problems.join(" ");
    diagnosis = null;
    templateId = tpl.id;
    sector = tpl.category;
  }

  const slug = await uniqueSlug(spec.name);
  const { data: project, error } = await db
    .from("projects")
    .insert({ owner_id: profile.id, name: spec.name, slug, sector, problem, diagnosis, status: "generation", template_id: templateId })
    .select("id,draft_spec,draft_version")
    .single();
  if (error || !project) throw new HttpError(500, "Création du projet impossible.");
  await db.from("project_members").insert({ project_id: project.id, user_id: profile.id, role: "owner" });
  await audit("project.created", { projectId: project.id, actorId: profile.id, details: { templateId, slug } });
  const saved = await saveVersion(project, spec, { summary: templateId ? "Création à partir d'un modèle" : "Première génération", source: templateId ? "template" : "generation", authorId: profile.id });
  return NextResponse.json({ id: project.id, version: saved.version, checks: saved.checks });
});
