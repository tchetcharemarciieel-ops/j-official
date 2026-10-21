import { NextResponse } from "next/server";
import { assertSameOrigin, route } from "@/lib/api";
import { draftSpec, getAccess, HttpError } from "@/lib/access";
import { autoFix } from "@/lib/checks";
import { diffSpecs } from "@/lib/diff";
import { saveVersion } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

/** Applique les corrections sûres proposées par les tests (nouvelle version, données intactes). */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  const spec = draftSpec(project);
  if (!spec) throw new HttpError(409, "Le logiciel n'a pas encore été généré.");
  const fixed = autoFix(spec);
  const changes = diffSpecs(spec, fixed);
  if (!changes.length && JSON.stringify(fixed) === JSON.stringify(spec)) return NextResponse.json({ changed: false });
  const saved = await saveVersion(project, fixed, { summary: "Corrections automatiques suite aux tests", source: "manual", authorId: profile.id });
  return NextResponse.json({ changed: true, version: saved.version, checks: saved.checks });
});
