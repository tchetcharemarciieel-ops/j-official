import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { saveVersion, createBackup } from "@/lib/projects";
import { parseSpec } from "@/lib/spec";
import { summarize } from "@/lib/checks";

type Ctx = { params: Promise<{ id: string }> };

/** Applique une proposition validée par le propriétaire. La spec est revalidée côté serveur. */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  const input = z
    .object({ spec: z.unknown(), summary: z.string().max(1000), source: z.enum(["ai", "rules", "manual"]), baseVersion: z.number().int() })
    .parse(await readJson(req));
  if (input.baseVersion !== project.draft_version) throw new HttpError(409, "Le logiciel a changé depuis cette proposition. Relancez la demande.");
  const parsed = parseSpec(input.spec);
  if (!parsed.ok) throw new HttpError(400, `Proposition invalide : ${parsed.errors.slice(0, 3).join(" ; ")}`);
  const saved = await saveVersion(project, parsed.spec, { summary: input.summary, source: input.source, authorId: profile.id });
  // Sauvegarde des données réelles après un changement de structure d'un logiciel publié
  if (project.status === "published" || project.status === "suspended") await createBackup(id, `Avant application de la version ${saved.version}`, profile.id, project.published_version);
  return NextResponse.json({ version: saved.version, checks: saved.checks, summary: summarize(saved.checks) });
});
