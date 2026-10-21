import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";
import { appContext } from "@/lib/app-data";
import { can } from "@/lib/permissions";
import { CREDIT_COSTS } from "@/lib/config";
import { withCredits } from "@/lib/credits";
import { aiPlanQuery } from "@/lib/ai";
import { executePlan, planWithRules, type Plan } from "@/lib/query";
import type { Row } from "@/lib/stats";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/**
 * Assistant de données : l'IA (ou les règles) traduit la question en requête,
 * le serveur calcule sur les seules données autorisées. Aucun chiffre n'est produit par l'IA.
 */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z.object({ mode: z.enum(["demo", "live"]), question: z.string().trim().min(3).max(500) }).parse(await readJson(req));
  const ctx = await appContext(id, input.mode);
  const readableSpec = { ...ctx.spec, entities: ctx.spec.entities.filter((e) => can(e, ctx.role, "read")) };

  const { result: plan, engine } = await withCredits<Plan>({ userId: ctx.profile.id, projectId: id, operation: "ask", credits: CREDIT_COSTS.ask }, async (engine) => {
    if (engine === "ai") {
      const r = await aiPlanQuery(readableSpec, input.question);
      return { result: r.plan, usage: r.usage };
    }
    return { result: planWithRules(readableSpec, input.question) };
  });

  let rows: Row[] = [];
  if (plan.answerable && readableSpec.entities.some((e) => e.key === plan.entity)) {
    const { data } = await adminClient().from("records").select("id,data,created_at").eq("project_id", id).eq("is_demo", input.mode === "demo").eq("entity", plan.entity).limit(10000);
    rows = (data ?? []) as Row[];
  } else if (plan.answerable) {
    plan.answerable = false;
    plan.reason = "Cette table n'existe pas ou n'est pas accessible avec votre rôle.";
  }
  const answer = executePlan(readableSpec, plan, rows);
  return NextResponse.json({ ...answer, engine, mode: input.mode === "demo" ? "Données de démonstration" : "Données réelles" });
});
