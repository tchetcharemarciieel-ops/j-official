import { NextResponse } from "next/server";
import { assertSameOrigin, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { saveVersion } from "@/lib/projects";
import { parseSpec } from "@/lib/spec";

type Ctx = { params: Promise<{ id: string; version: string }> };

/** Restaure la structure d'une version antérieure. Les données métier ne sont jamais effacées. */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id, version } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  const v = Number(version);
  if (!Number.isInteger(v) || v < 1) throw new HttpError(400, "Version invalide.");
  const { data } = await adminClient().from("project_versions").select("spec").eq("project_id", id).eq("version", v).maybeSingle();
  if (!data) throw new HttpError(404, "Version introuvable.");
  const parsed = parseSpec(data.spec);
  if (!parsed.ok) throw new HttpError(409, "Cette version n'est plus compatible avec le moteur actuel.");
  const saved = await saveVersion(project, parsed.spec, { summary: `Restauration de la version ${v}`, source: "restore", authorId: profile.id });
  return NextResponse.json({ version: saved.version, checks: saved.checks });
});
