import "server-only";
import { adminClient } from "./supabase/admin";
import { serverConfigured } from "./config";
import { activePaymentProvider } from "./payments";

export type Plan = {
  id: string;
  name: string;
  price_xaf: number;
  monthly_credits: number;
  max_projects: number;
  max_members: number;
  can_publish: boolean;
  ai_modifications: boolean;
  description: string;
  sort: number;
  /** Formule proposée aux clients ; une formule désactivée reste valable pour ses abonnés. */
  active?: boolean;
};

/** Valeurs par défaut identiques à la migration ; la base fait foi quand elle est configurée. */
export const DEFAULT_PLANS: Plan[] = [
  { id: "decouverte", name: "Découverte", price_xaf: 0, monthly_credits: 20, max_projects: 1, max_members: 200, can_publish: false, ai_modifications: true, description: "Essais limités et applications de démonstration.", sort: 1 },
  { id: "pro", name: "Pro", price_xaf: 15000, monthly_credits: 200, max_projects: 5, max_members: 200, can_publish: true, ai_modifications: true, description: "Publication de logiciels, modifications par IA.", sort: 2 },
  { id: "business", name: "Business", price_xaf: 45000, monthly_credits: 800, max_projects: 20, max_members: 200, can_publish: true, ai_modifications: true, description: "Plusieurs logiciels, équipes et permissions avancées.", sort: 3 },
  { id: "agence", name: "Agence", price_xaf: 120000, monthly_credits: 3000, max_projects: 100, max_members: 200, can_publish: true, ai_modifications: true, description: "Création de logiciels pour plusieurs clients.", sort: 4 },
];

export async function getPlans(opts: { includeInactive?: boolean } = {}): Promise<Plan[]> {
  if (!serverConfigured()) return DEFAULT_PLANS;
  const { data } = await adminClient().from("plans").select("*").order("sort");
  const plans = (data as Plan[] | null)?.length ? (data as Plan[]) : DEFAULT_PLANS;
  return opts.includeInactive ? plans : plans.filter((p) => p.active !== false);
}

/** Nombre de logiciels qu'un compte peut créer avec sa formule (Découverte 1, Pro 5, Business 20… réglable dans l'administration). */
export async function projectLimit(planId: string): Promise<{ limit: number; planName: string }> {
  const plan = (await getPlans({ includeInactive: true })).find((p) => p.id === planId);
  return { limit: Math.max(1, plan?.max_projects ?? 1), planName: plan?.name ?? "Découverte" };
}

export function paymentsConfigured(): boolean {
  // Vrai seulement si un prestataire de paiement est réellement branché (voir lib/payments.ts).
  return activePaymentProvider() !== null;
}

export const xaf = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;

/**
 * Liens de paiement des formules (page de paiement du prestataire). Le paiement par lien ne
 * prévient pas MiniSoft : l'équipe vérifie le reçu puis active la formule dans l'administration.
 */
export const PLAN_PAYMENT_LINKS: Record<string, string> = {
  pro: "https://link.saspay.me/ssdelkmtxs8",
};
