import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/config";
import { withCredits } from "@/lib/credits";
import { aiConfig, aiDiagnose, type AiUsage } from "@/lib/ai";
import { burstLimited, checkAiQuota } from "@/lib/ai-quota";
import { diagnoseWithRules, type Diagnosis, type DiagnoseResponse } from "@/lib/generator";

const body = z.object({
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
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connectez-vous pour lancer l'analyse.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (burstLimited(`diagnose:${ip}`) || burstLimited(`diagnose:${profile.id}`)) throw new HttpError(429, "Trop d'analyses en peu de temps. Patientez quelques minutes avant de réessayer.");
  const input = body.parse(await readJson(req, 6_000_000));

  const cfg = aiConfig();
  let fallbackReason: string | null = null;
  if (!cfg) fallbackReason = "Aucun fournisseur IA n'est configuré sur le serveur.";
  else {
    const quota = await checkAiQuota(profile.id).catch(() => ({ ok: false as const, reason: "Les limites d'utilisation de l'IA n'ont pas pu être vérifiées." }));
    if (!quota.ok) fallbackReason = quota.reason;
  }

  if (cfg && !fallbackReason) {
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
});
