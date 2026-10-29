import { NextResponse } from "next/server";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/config";
import { aiAssistant, aiConfig, refreshAiSettings } from "@/lib/ai";
import { burstLimited, checkAiQuota } from "@/lib/ai-quota";
import { withCredits } from "@/lib/credits";
import { CLIENT_ASSISTANT } from "@/lib/assistant";
import { chatBody } from "@/lib/assistant-schema";

export const maxDuration = 120;

/** Assistant de l'espace client : comprendre l'activité, prioriser les problèmes, concevoir le mini-logiciel. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connectez-vous pour utiliser l'assistant.");
  if (profile.suspended) throw new HttpError(403, "Compte suspendu.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (burstLimited(`assistant:${profile.id}`) || burstLimited(`assistant:${ip}`)) throw new HttpError(429, "Trop de messages en peu de temps. Patientez quelques minutes.");
  const input = chatBody.parse(await readJson(req, 400_000));
  await refreshAiSettings();
  if (!aiConfig()) throw new HttpError(503, "L'assistant IA n'est pas disponible pour le moment. Vous pouvez décrire votre besoin directement dans « Créer un logiciel ».");
  const quota = await checkAiQuota(profile.id);
  if (!quota.ok) throw new HttpError(429, quota.reason);
  const { result, creditsUsed } = await withCredits({ userId: profile.id, operation: "assistant", credits: CREDIT_COSTS.ask, engine: "ai", notifyOnFailure: false }, async () => {
    const { answer, usage } = await aiAssistant(CLIENT_ASSISTANT, input.messages);
    return { result: answer, usage };
  });
  return NextResponse.json({ ...result, creditsUsed });
});
