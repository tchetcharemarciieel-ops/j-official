import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { draftSpec, getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { CREDIT_COSTS } from "@/lib/config";
import { withCredits } from "@/lib/credits";
import { aiModify } from "@/lib/ai";
import { modifyWithRules } from "@/lib/modify-rules";
import { autoFix, runChecks } from "@/lib/checks";
import { diffSpecs } from "@/lib/diff";
import type { AppSpec } from "@/lib/spec";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 120;

/**
 * Prépare une modification SANS l'appliquer : renvoie la proposition, la liste
 * des changements et le résultat des tests, pour prévisualisation avant/après.
 */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  const { instruction } = z.object({ instruction: z.string().trim().min(3).max(2000) }).parse(await readJson(req));
  const spec = draftSpec(project);
  if (!spec) throw new HttpError(409, "Le logiciel n'a pas encore été généré.");

  const { data: plan } = await adminClient().from("plans").select("ai_modifications").eq("id", profile.plan).single();
  if (!profile.is_admin && plan && !plan.ai_modifications) throw new HttpError(402, "Les modifications par IA ne sont pas incluses dans votre formule.");

  const { result, engine, creditsUsed } = await withCredits<{ spec: AppSpec; summary: string }>(
    { userId: profile.id, projectId: id, operation: "modify", credits: CREDIT_COSTS.modify },
    async (engine) => {
      if (engine === "ai") {
        const r = await aiModify(spec, instruction);
        return { result: { spec: r.spec, summary: r.summary }, usage: r.usage };
      }
      const r = modifyWithRules(spec, instruction);
      if (!r.ok) return { result: { spec, summary: r.message } };
      return { result: { spec: r.spec, summary: r.summary } };
    },
  );

  let candidate = result.spec;
  let checks = runChecks(candidate, spec);
  if (checks.some((c) => c.status === "fail" && c.autoFixable)) {
    candidate = autoFix(candidate);
    checks = runChecks(candidate, spec);
  }
  const changes = diffSpecs(spec, candidate);
  return NextResponse.json({ engine, creditsUsed, summary: result.summary, changes, checks, proposal: changes.length ? candidate : null, baseVersion: project.draft_version });
});
