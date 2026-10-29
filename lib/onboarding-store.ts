import "server-only";
import { adminClient } from "./supabase/admin";
import { sectorLabel, type OnboardingAnswers } from "./onboarding";

/**
 * Enregistre les réponses du questionnaire (service_role, côté serveur uniquement) et reporte
 * le nom et le secteur de l'entreprise dans le profil. Ne lève jamais : renvoie false en cas d'échec.
 */
export async function saveOnboarding(userId: string, answers: OnboardingAnswers | null, companyName = ""): Promise<boolean> {
  const db = adminClient();
  try {
    if (answers) {
      const { error } = await db.from("onboarding_answers").upsert({ user_id: userId, answers, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
    const patch: Record<string, string> = {};
    if (companyName) patch.company_name = companyName.slice(0, 120);
    if (answers) patch.company_sector = sectorLabel(answers).slice(0, 80);
    if (Object.keys(patch).length) await db.from("profiles").update(patch).eq("id", userId);
    return true;
  } catch (e) {
    console.error("[onboarding] enregistrement impossible :", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function loadOnboarding(userId: string): Promise<OnboardingAnswers | null> {
  const { data } = await adminClient().from("onboarding_answers").select("answers").eq("user_id", userId).maybeSingle();
  return (data?.answers as OnboardingAnswers | undefined) ?? null;
}
