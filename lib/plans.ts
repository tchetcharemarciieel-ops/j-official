import "server-only";
import { adminClient } from "./supabase/admin";
import { serverConfigured } from "./config";

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
};

/** Valeurs par défaut identiques à la migration ; la base fait foi quand elle est configurée. */
export const DEFAULT_PLANS: Plan[] = [
  { id: "decouverte", name: "Découverte", price_xaf: 0, monthly_credits: 20, max_projects: 1, max_members: 1, can_publish: false, ai_modifications: true, description: "Essais limités et applications de démonstration.", sort: 1 },
  { id: "pro", name: "Pro", price_xaf: 15000, monthly_credits: 200, max_projects: 5, max_members: 5, can_publish: true, ai_modifications: true, description: "Publication de logiciels, modifications par IA.", sort: 2 },
  { id: "business", name: "Business", price_xaf: 45000, monthly_credits: 800, max_projects: 20, max_members: 25, can_publish: true, ai_modifications: true, description: "Plusieurs logiciels, équipes et permissions avancées.", sort: 3 },
  { id: "agence", name: "Agence", price_xaf: 120000, monthly_credits: 3000, max_projects: 100, max_members: 100, can_publish: true, ai_modifications: true, description: "Création de logiciels pour plusieurs clients.", sort: 4 },
];

export async function getPlans(): Promise<Plan[]> {
  if (!serverConfigured()) return DEFAULT_PLANS;
  const { data } = await adminClient().from("plans").select("*").order("sort");
  return (data as Plan[] | null)?.length ? (data as Plan[]) : DEFAULT_PLANS;
}

export function paymentsConfigured(): boolean {
  // Aucun prestataire de paiement n'est branché : aucune facturation n'est possible.
  return false;
}

export const xaf = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
