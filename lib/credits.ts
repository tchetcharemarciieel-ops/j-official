import "server-only";
import { adminClient } from "./supabase/admin";
import { aiAvailable, AiError, type AiUsage } from "./ai";
import { audit } from "./audit";
import { HttpError } from "./access";

/**
 * Règle de facturation annoncée : les crédits sont réservés avant l'appel IA
 * et remboursés intégralement si l'opération échoue. L'analyse par règles (sans IA) est gratuite.
 */
export async function withCredits<T>(
  opts: { userId: string; projectId?: string | null; operation: string; credits: number },
  run: (engine: "ai" | "rules") => Promise<{ result: T; usage?: AiUsage }>,
): Promise<{ result: T; engine: "ai" | "rules"; creditsUsed: number }> {
  const db = adminClient();
  const engine = aiAvailable() ? "ai" : "rules";
  const cost = engine === "ai" ? opts.credits : 0;
  if (cost > 0) {
    const { data: ok, error } = await db.rpc("consume_credits", { uid: opts.userId, amount: cost });
    if (error) throw new HttpError(500, "Impossible de vérifier vos crédits.");
    if (!ok) throw new HttpError(402, `Crédits insuffisants : cette opération coûte ${cost} crédit(s).`);
  }
  try {
    const { result, usage } = await run(engine);
    await db.from("ai_usage").insert({
      user_id: opts.userId,
      project_id: opts.projectId ?? null,
      operation: opts.operation,
      engine,
      model: usage?.model ?? null,
      input_tokens: usage?.inputTokens ?? 0,
      output_tokens: usage?.outputTokens ?? 0,
      cost_xaf: usage?.costXaf ?? 0,
      credits: cost,
      status: "success",
    });
    return { result, engine, creditsUsed: cost };
  } catch (err) {
    if (cost > 0) await db.rpc("refund_credits", { uid: opts.userId, amount: cost });
    const usage = err instanceof AiError ? err.usage : undefined;
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    await db.from("ai_usage").insert({
      user_id: opts.userId,
      project_id: opts.projectId ?? null,
      operation: opts.operation,
      engine,
      model: usage?.model ?? null,
      input_tokens: usage?.inputTokens ?? 0,
      output_tokens: usage?.outputTokens ?? 0,
      cost_xaf: usage?.costXaf ?? 0,
      credits: 0,
      status: cost > 0 ? "refunded" : "failed",
      error: message.slice(0, 500),
    });
    await audit(`${opts.operation}.failed`, { projectId: opts.projectId, actorId: opts.userId, level: "error", details: { message: message.slice(0, 500), refunded: cost } });
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, `${message}${cost > 0 ? ` Vos ${cost} crédit(s) ont été remboursés.` : ""}`);
  }
}
