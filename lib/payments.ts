import "server-only";
import { adminClient } from "./supabase/admin";

/**
 * Paiements : architecture prête à recevoir un prestataire adapté à la RCA
 * (Mobile Money Orange / Moov, agrégateurs type CinetPay…).
 *
 * Règle absolue : un paiement n'est « réussi » qu'après confirmation du prestataire
 * (notification signée vérifiée par `verifyNotification`). Aucune action manuelle ni
 * retour navigateur ne peut marquer un paiement comme payé.
 */
export type PaymentProvider = {
  id: string;
  label: string;
  /** Vrai si les clés du prestataire sont présentes dans l'environnement du serveur. */
  configured: () => boolean;
  /** Crée une demande de paiement et renvoie l'adresse de paiement du prestataire. */
  createCheckout: (input: { paymentId: string; amountXaf: number; description: string; customerEmail: string; returnUrl: string; notifyUrl: string }) => Promise<{ providerRef: string; checkoutUrl: string }>;
  /** Vérifie l'authenticité d'une notification du prestataire et renvoie l'état confirmé. */
  verifyNotification: (req: Request) => Promise<{ providerRef: string; status: "succeeded" | "failed"; amountXaf: number }>;
  /** Remboursement, si le prestataire le permet. */
  refund?: (providerRef: string) => Promise<void>;
};

/** Prestataires disponibles. Aucun n'est branché : ajouter ici l'adaptateur du prestataire retenu. */
export const PAYMENT_PROVIDERS: PaymentProvider[] = [];

export function activePaymentProvider(): PaymentProvider | null {
  return PAYMENT_PROVIDERS.find((p) => p.configured()) ?? null;
}

/**
 * À appeler uniquement depuis la route de notification du prestataire, après `verifyNotification`.
 * Active l'abonnement lié et met à jour la formule et les crédits du client.
 */
export async function applyConfirmedPayment(providerId: string, confirmation: { providerRef: string; status: "succeeded" | "failed"; amountXaf: number }) {
  const db = adminClient();
  const { data: pay } = await db.from("payments").select("id,user_id,plan_id,amount_xaf,status").eq("provider", providerId).eq("provider_ref", confirmation.providerRef).maybeSingle();
  if (!pay || pay.status === "succeeded") return;
  if (confirmation.status !== "succeeded" || confirmation.amountXaf < pay.amount_xaf) {
    await db.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", pay.id);
    return;
  }
  const now = new Date();
  const { data: sub } = await db
    .from("subscriptions")
    .insert({ user_id: pay.user_id, plan_id: pay.plan_id, status: "active", source: providerId, started_at: now.toISOString(), ends_at: new Date(now.getTime() + 30 * 86400000).toISOString() })
    .select("id")
    .single();
  await db.from("payments").update({ status: "succeeded", confirmed_at: now.toISOString(), subscription_id: sub?.id ?? null, updated_at: now.toISOString() }).eq("id", pay.id);
  const { data: plan } = await db.from("plans").select("monthly_credits").eq("id", pay.plan_id).single();
  await db.from("profiles").update({ plan: pay.plan_id, credits: plan?.monthly_credits ?? 0 }).eq("id", pay.user_id);
}
