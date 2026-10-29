import { NextResponse } from "next/server";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { assertAdminApi } from "@/lib/admin";
import { aiAssistant, aiConfig, refreshAiSettings } from "@/lib/ai";
import { burstLimited } from "@/lib/ai-quota";
import { withCredits } from "@/lib/credits";
import { OWNER_AGENTS } from "@/lib/assistant";
import { z } from "zod";
import { chatBody } from "@/lib/assistant-schema";

export const maxDuration = 120;

/** Assistant du propriétaire (diagnostic, conception, qualité, commercial). Aucune action externe. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  if (burstLimited(`assistant-admin:${admin.id}`, 40)) throw new HttpError(429, "Trop de messages en peu de temps. Patientez quelques minutes.");
  const input = chatBody.extend({ agent: z.enum(["general", "diagnostic", "conception", "qualite", "commercial"]).default("general") }).parse(await readJson(req, 400_000));
  await refreshAiSettings();
  if (!aiConfig()) throw new HttpError(503, "Aucun fournisseur IA n'est configuré : réglez-le dans Administration › Intelligence artificielle.");
  const { result } = await withCredits({ userId: admin.id, operation: `assistant_${input.agent}`, credits: 0, engine: "ai", notifyOnFailure: false }, async () => {
    const { answer, usage } = await aiAssistant(OWNER_AGENTS[input.agent].prompt, input.messages);
    return { result: { reply: answer.reply, suggestions: answer.suggestions, model: usage.model }, usage };
  });
  return NextResponse.json(result);
});
