import "server-only";
import { adminClient } from "./supabase/admin";
import { aiLimits, refreshAiSettings } from "./ai";

/**
 * Limites d'appels IA pour éviter les abus et maîtriser les coûts.
 * Elles reposent sur le journal ai_usage (persistant, partagé entre redémarrages).
 * Quand une limite est atteinte, l'analyse passe par le système de secours.
 */

async function countAiCalls(sinceMs: number, userId?: string, max = 1000): Promise<number> {
  let q = adminClient()
    .from("ai_usage")
    .select("id")
    .eq("engine", "ai")
    .gte("created_at", new Date(Date.now() - sinceMs).toISOString())
    .limit(max + 1);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw new Error("Impossible de vérifier les limites d'utilisation de l'IA.");
  return data?.length ?? 0;
}

export async function checkAiQuota(userId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  await refreshAiSettings();
  const LIMITS = aiLimits();
  const HOUR = 3600_000;
  if ((await countAiCalls(HOUR, userId, LIMITS.userHourly)) >= LIMITS.userHourly)
    return { ok: false, reason: `Limite de ${LIMITS.userHourly} analyses IA par heure atteinte pour votre compte.` };
  if ((await countAiCalls(24 * HOUR, userId, LIMITS.userDaily)) >= LIMITS.userDaily)
    return { ok: false, reason: `Limite de ${LIMITS.userDaily} analyses IA par jour atteinte pour votre compte.` };
  if ((await countAiCalls(24 * HOUR, undefined, LIMITS.globalDaily)) >= LIMITS.globalDaily)
    return { ok: false, reason: "La limite quotidienne d'analyses IA de la plateforme est atteinte." };
  return { ok: true };
}

/** Limite de rafale par adresse IP (mémoire du serveur) : protège aussi le système de secours. */
const hits = new Map<string, number[]>();
export function burstLimited(key: string, max = Number(process.env.AI_IP_BURST_LIMIT || 20), windowMs = 10 * 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return recent.length > max;
}

/** Dernier appel IA réussi : seule preuve qu'une connexion réelle a fonctionné. */
export async function lastAiSuccess(): Promise<{ at: string; model: string | null } | null> {
  const { data } = await adminClient().from("ai_usage").select("created_at,model").eq("engine", "ai").eq("status", "success").order("created_at", { ascending: false }).limit(1);
  const row = data?.[0];
  return row ? { at: row.created_at as string, model: (row.model as string | null) ?? null } : null;
}
