import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { appContext } from "@/lib/app-data";
import { CREDIT_COSTS } from "@/lib/config";
import { withCredits } from "@/lib/credits";
import { aiAssistant } from "@/lib/ai";
import { burstLimited, checkAiQuota } from "@/lib/ai-quota";
import { clientIp } from "@/lib/client-ip";
import { has } from "@/lib/team";
import { allowed } from "@/lib/shop/engine";
import { answerByRules, buildFacts, systemPrompt } from "@/lib/shop/assistant";
import { SupabaseStore } from "@/lib/shop/supabase-store";
import { settingsOf } from "@/lib/shop/model";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

/**
 * MiniSoft AI : répond sur les données autorisées du poste. Les chiffres sont calculés par le
 * serveur ; l'IA les explique. Aucune écriture n'est possible depuis cette route.
 */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z.object({ mode: z.enum(["demo", "live"]), turns: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).min(1).max(20) }).parse(await readJson(req, 60_000));
  const ctx = await appContext(id, input.mode);
  if (ctx.spec.module !== "shop") throw new HttpError(404, "Ce logiciel n'est pas une boutique MiniSoft Shop.");
  if (!has(ctx.perms, ["rapports", "stock", "finances"])) throw new HttpError(403, "L'assistant ne fait pas partie de votre poste.");
  const last = input.turns[input.turns.length - 1]!;
  if (last.role !== "user" || last.text.trim().length < 2) throw new HttpError(400, "Posez votre question.");

  const store = new SupabaseStore(id, input.mode === "demo", ctx.profile.id);
  const data = await store.all();
  const scope = { cost: has(ctx.perms, ["stock", "achats", "rapports", "finances"]), finances: allowed(ctx.perms, ctx.role, "finances") || has(ctx.perms, "rapports") };
  const settings = settingsOf(data.settings[0], ctx.project.name);
  const facts = buildFacts(data, scope, settings.name);

  const rules = answerByRules(last.text, facts, scope);
  // Question courante : réponse calculée (gratuite, sans crédit). L'IA sert aux demandes ouvertes.
  const wantsAi = !rules || /(description|rediger|redige|ecris|ecrire|explique|pourquoi|conseil|idee)/i.test(last.text);
  if (rules && !wantsAi) return NextResponse.json({ reply: rules.reply, basis: rules.basis, engine: "rules", suggestions: SUGGESTIONS });

  const quota = await checkAiQuota(ctx.profile.id);
  if (!quota.ok || burstLimited(`shop-ai:${clientIp(req)}`)) {
    if (rules) return NextResponse.json({ reply: rules.reply, basis: rules.basis, engine: "rules", suggestions: SUGGESTIONS });
    throw new HttpError(429, quota.ok ? "Trop de demandes : patientez quelques minutes." : quota.reason);
  }
  const { result, engine, creditsUsed } = await withCredits<{ reply: string; basis: string }>({ userId: ctx.profile.id, projectId: id, operation: "ask", credits: CREDIT_COSTS.ask }, async (eng) => {
    if (eng !== "ai") {
      if (rules) return { result: { reply: rules.reply, basis: rules.basis } };
      return { result: { reply: "Je n'ai pas de réponse calculée pour cette question sans l'assistant IA. Essayez : « Quels produits se vendent le mieux ? », « Quels produits sont presque épuisés ? », « Mon chiffre d'affaires cette semaine », « Liste de réapprovisionnement », « Résumé de mon activité ».", basis: "Mode sans IA." } };
    }
    const r = await aiAssistant(systemPrompt(facts, scope), input.turns);
    return { result: { reply: r.answer.reply, basis: "Chiffres calculés par le serveur à partir des données de la boutique." }, usage: r.usage };
  });
  return NextResponse.json({ ...result, engine, creditsUsed, suggestions: SUGGESTIONS });
});

const SUGGESTIONS = ["Quels produits se vendent le mieux ?", "Quels produits sont presque épuisés ?", "Prépare une liste de réapprovisionnement", "Fais-moi un résumé de mon activité", "Quels produits pourrais-je mettre en promotion ?"];
