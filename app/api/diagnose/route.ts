import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/config";
import { withCredits } from "@/lib/credits";
import { aiConfig, aiDiagnose, refreshAiSettings, type AiUsage } from "@/lib/ai";
import { burstLimited, checkAiQuota } from "@/lib/ai-quota";
import { adminClient } from "@/lib/supabase/admin";
import { diagnoseWithRules, type Diagnosis, type DiagnoseResponse } from "@/lib/generator";

const body = z.object({
  jobId: z.string().uuid().optional(),
  /** Analyse rapide (activité choisie en un appui) : plan par modèles validés, instantané et gratuit, sans IA. */
  quick: z.boolean().optional(),
  problem: z.string().trim().min(5, "Décrivez votre problème en quelques mots.").max(4000),
  businessName: z.string().trim().max(80).optional(),
  answers: z.array(z.object({ question: z.string().max(200), answer: z.string().trim().max(1000) })).max(10).optional(),
  csvColumns: z.array(z.object({ name: z.string().max(80), type: z.string().max(20) })).max(60).optional(),
  image: z
    .object({
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      // ~3,5 Mo une fois décodé au maximum
      data: z.string().max(4_800_000).regex(/^[A-Za-z0-9+/=]+$/),
    })
    .optional(),
});

export const maxDuration = 120;

/**
 * Analyse d'un problème d'entreprise. Ordre : fournisseur IA (si configuré, dans les limites
 * d'utilisation et avec assez de crédits), sinon système de secours par mots-clés.
 * La clé API reste côté serveur ; la réponse indique toujours quel moteur a produit le résultat.
 */
async function handle(req: Request, input: z.infer<typeof body>): Promise<NextResponse> {
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connectez-vous pour lancer l'analyse.");
  const ip = clientIp(req);
  if (burstLimited(`diagnose:${ip}`) || burstLimited(`diagnose:${profile.id}`)) throw new HttpError(429, "Trop d'analyses en peu de temps. Patientez quelques minutes avant de réessayer.");

  await refreshAiSettings();
  const cfg = aiConfig();
  let fallbackReason: string | null = null;
  if (input.quick) fallbackReason = null;
  else if (!cfg) fallbackReason = "Aucun fournisseur IA n'est configuré sur le serveur.";
  else {
    const quota = await checkAiQuota(profile.id).catch(() => ({ ok: false as const, reason: "Les limites d'utilisation de l'IA n'ont pas pu être vérifiées." }));
    if (!quota.ok) fallbackReason = quota.reason;
  }

  if (cfg && !fallbackReason && !input.quick) {
    try {
      const answered: { usage: AiUsage | null } = { usage: null };
      const { result, creditsUsed } = await withCredits<Diagnosis>(
        { userId: profile.id, operation: "diagnose", credits: CREDIT_COSTS.diagnose, engine: "ai", notifyOnFailure: false },
        async () => {
          const { diagnosis, usage } = await aiDiagnose(input, input.image);
          answered.usage = usage;
          return { result: diagnosis, usage };
        },
      );
      return NextResponse.json({ diagnosis: result, engine: "ai", provider: { name: answered.usage?.provider ?? cfg.label, model: answered.usage?.model ?? cfg.model, fallback: answered.usage?.fallback ?? false }, fallbackReason: null, creditsUsed } satisfies DiagnoseResponse);
    } catch (err) {
      // Crédits déjà remboursés par withCredits : on bascule sur le système de secours.
      fallbackReason =
        err instanceof HttpError && err.status === 402
          ? `Crédits insuffisants pour l'analyse IA (${CREDIT_COSTS.diagnose} crédits).`
          : `L'IA n'a pas pu répondre : ${err instanceof Error ? err.message.replace(/ ?Vos \d+ crédit\(s\) ont été remboursés\./, "") : "erreur inconnue"}`;
    }
  }

  const { result } = await withCredits<Diagnosis>({ userId: profile.id, operation: "diagnose", credits: 0, engine: "rules" }, async () => {
    const d = diagnoseWithRules(input);
    if (input.image) d.limits.unshift("L'image jointe n'a pas été analysée : seule l'IA sait lire les images.");
    return { result: d };
  });
  return NextResponse.json({ diagnosis: result, engine: "rules", provider: null, fallbackReason, creditsUsed: 0 } satisfies DiagnoseResponse);
}

/**
 * L'analyse tourne jusqu'au bout côté serveur même si la personne quitte la page : le résultat est gardé
 * (table diagnose_jobs) et retrouvé avec GET /api/diagnose/[jobId] quand elle revient.
 */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const input = body.parse(await readJson(req, 6_000_000));
  const profile = await getProfile();
  const jobId = input.jobId;
  if (!jobId || !profile) return handle(req, input);
  const db = adminClient();
  await db.from("diagnose_jobs").insert({ id: jobId, user_id: profile.id, status: "running" });
  try {
    const res = await handle(req, input);
    await db.from("diagnose_jobs").update({ status: "done", response: await res.clone().json() }).eq("id", jobId);
    return res;
  } catch (err) {
    const message = err instanceof HttpError ? err.message : "L'analyse n'a pas pu aboutir.";
    await db.from("diagnose_jobs").update({ status: "error", error: message }).eq("id", jobId);
    throw err;
  }
});
