import { NextResponse } from "next/server";
import { assertSameOrigin, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { aiConfig, aiPing, AiError } from "@/lib/ai";
import { burstLimited } from "@/lib/ai-quota";

/** Test réel du fournisseur IA (administrateurs) : un petit appel, journalisé dans ai_usage. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const admin = await getProfile();
  if (!admin?.is_admin) throw new HttpError(404, "Introuvable.");
  if (burstLimited(`ai-test:${admin.id}`, 5)) throw new HttpError(429, "Trop de tests rapprochés. Patientez quelques minutes.");
  const cfg = aiConfig();
  if (!cfg) return NextResponse.json({ ok: false, message: "Aucun fournisseur IA n'est configuré (AI_PROVIDER et clé API absents du serveur)." });
  const db = adminClient();
  try {
    const { usage, ms } = await aiPing();
    await db.from("ai_usage").insert({ user_id: admin.id, operation: "test", engine: "ai", model: usage.model, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cost_xaf: usage.costXaf, credits: 0, status: "success" });
    return NextResponse.json({ ok: true, message: `Connexion réussie : ${usage.provider ?? cfg.label} a répondu en ${(ms / 1000).toFixed(1)} s (modèle ${usage.model}${usage.fallback ? ", modèle de secours : le modèle principal a atteint sa limite" : ""}).` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    const usage = err instanceof AiError ? err.usage : undefined;
    await db.from("ai_usage").insert({ user_id: admin.id, operation: "test", engine: "ai", model: usage?.model ?? cfg.model, input_tokens: usage?.inputTokens ?? 0, output_tokens: usage?.outputTokens ?? 0, cost_xaf: usage?.costXaf ?? 0, credits: 0, status: "failed", error: message.slice(0, 500) });
    return NextResponse.json({ ok: false, message: `Échec : ${message}` });
  }
});
