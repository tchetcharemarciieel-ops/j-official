import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { draftSpec, getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { saveVersion } from "@/lib/projects";
import { automationSchema } from "@/lib/spec";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  const { automations } = z.object({ automations: z.array(automationSchema).max(20) }).parse(await readJson(req));
  const spec = draftSpec(project);
  if (!spec) throw new HttpError(409, "Le logiciel n'a pas encore été généré.");
  const ids = automations.map((a) => a.action.integrationId).filter(Boolean) as string[];
  if (ids.length) {
    const { data } = await adminClient().from("integrations").select("id").eq("project_id", id).in("id", ids);
    if ((data?.length ?? 0) !== new Set(ids).size) throw new HttpError(400, "Intégration inconnue.");
  }
  for (const a of automations) {
    if (!spec.entities.some((e) => e.key === a.trigger.entity)) throw new HttpError(400, `Table inconnue pour « ${a.label} ».`);
    if (a.action.type === "webhook" && !a.action.integrationId) throw new HttpError(400, `Choisissez une intégration pour « ${a.label} ».`);
  }
  const saved = await saveVersion(project, { ...spec, automations }, { summary: "Automatisations mises à jour", source: "manual", authorId: profile.id });
  return NextResponse.json({ version: saved.version, note: "Les automatisations s'appliquent aux données réelles après republication." });
});
