import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { CREDIT_COSTS } from "@/lib/config";
import { withCredits } from "@/lib/credits";
import { aiAssistant } from "@/lib/ai";
import { burstLimited, checkAiQuota } from "@/lib/ai-quota";
import { clientIp } from "@/lib/client-ip";
import { has } from "@/lib/team";
import { answerByRules, buildFacts, systemPrompt } from "@/lib/transport/assistant";
import { SupabaseStore } from "@/lib/transport/supabase-store";
import { visibleData } from "@/lib/transport/visibility";
import { settingsOf } from "@/lib/transport/model";
import { transportContext } from "../route";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;
const SUGGESTIONS = ["Fais-moi un résumé de l'activité", "Quelles livraisons sont en retard ?", "Aide-moi à affecter les commandes", "Quelles sont les performances des livreurs ?", "Où en sont les dépenses et les recettes ?"];

/** MiniSoft AI : répond sur les données autorisées du poste ; les chiffres sont calculés par le serveur, rien n'est modifié. */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z.object({ mode: z.enum(["demo", "live"]), turns: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(6000) })).min(1).max(20) }).parse(await readJson(req, 80_000));
  const ctx = await transportContext(id, input.mode);
  const last = input.turns[input.turns.length - 1]!;
  if (last.role !== "user" || last.text.trim().length < 2) throw new HttpError(400, "Posez votre question.");
  const store = new SupabaseStore(id, input.mode === "demo", ctx.profile.id);
  const data = visibleData(await store.all(), ctx.profile.id, ctx.role, ctx.perms);
  const settings = settingsOf(data.settings[0], ctx.project.name);
  const scope = { finances: has(ctx.perms, "finances") };
  const facts = buildFacts(data, scope, settings.name, settings.currency);
  const rules = answerByRules(last.text, facts, settings.currency);
  // Réunion, rédaction ou question ouverte : l'IA ; question courante : réponse calculée, gratuite.
  const wantsAi = !rules || /(rediger|redige|ecris|ecrire|explique|pourquoi|conseil|ameliorer|propose|idee|tournee)/i.test(last.text);
  if (rules && !wantsAi) return NextResponse.json({ reply: rules.reply, basis: rules.basis, engine: "rules", suggestions: SUGGESTIONS });
  const quota = await checkAiQuota(ctx.profile.id);
  if (!quota.ok || burstLimited(`transport-ai:${clientIp(req)}`)) {
    if (rules) return NextResponse.json({ reply: rules.reply, basis: rules.basis, engine: "rules", suggestions: SUGGESTIONS });
    throw new HttpError(429, quota.ok ? "Trop de demandes : patientez quelques minutes." : quota.reason);
  }
  const { result, engine, creditsUsed } = await withCredits<{ reply: string; basis: string }>({ userId: ctx.profile.id, projectId: id, operation: "ask", credits: CREDIT_COSTS.ask }, async (eng) => {
    if (eng !== "ai") {
      if (rules) return { result: { reply: rules.reply, basis: rules.basis } };
      return { result: { reply: "Sans l'assistant IA, je réponds seulement aux questions courantes : résumé de l'activité, retards, organisation de la journée, finances du mois, avancement des projets. Essayez l'une de ces questions.", basis: "Mode sans IA." } };
    }
    const r = await aiAssistant(systemPrompt(facts, scope), input.turns);
    return { result: { reply: r.answer.reply, basis: "Chiffres calculés par le serveur à partir des données que vous avez le droit de voir." }, usage: r.usage };
  });
  return NextResponse.json({ ...result, engine, creditsUsed, suggestions: SUGGESTIONS });
});
