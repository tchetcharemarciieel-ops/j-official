import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/config";
import { withCredits } from "@/lib/credits";
import { aiDiagnose } from "@/lib/ai";
import { diagnoseWithRules, type Diagnosis } from "@/lib/generator";

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

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connectez-vous pour lancer l'analyse.");
  const input = body.parse(await readJson(req, 6_000_000));
  const { result, engine, creditsUsed } = await withCredits<Diagnosis>(
    { userId: profile.id, operation: "diagnose", credits: CREDIT_COSTS.diagnose },
    async (engine) => {
      if (engine === "ai") {
        const { diagnosis, usage } = await aiDiagnose(input, input.image);
        return { result: diagnosis, usage };
      }
      const d = diagnoseWithRules(input);
      if (input.image) d.limits.unshift("L'image jointe n'a pas été analysée : l'analyse d'images nécessite un fournisseur IA configuré.");
      return { result: d };
    },
  );
  return NextResponse.json({ diagnosis: result, engine, creditsUsed });
});
