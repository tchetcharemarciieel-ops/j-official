import { NextResponse } from "next/server";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { onboardingSchema } from "@/lib/onboarding";
import { loadOnboarding, saveOnboarding } from "@/lib/onboarding-store";

/** Réponses du questionnaire de l'utilisateur connecté (lecture et enregistrement différé). */
export const GET = route(async () => {
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connectez-vous.");
  return NextResponse.json({ answers: await loadOnboarding(profile.id) });
});

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connectez-vous.");
  const answers = onboardingSchema.parse(((await readJson(req)) as { answers?: unknown }).answers);
  if (!(await saveOnboarding(profile.id, answers))) throw new HttpError(500, "Enregistrement des réponses impossible pour le moment.");
  return NextResponse.json({ ok: true });
});
