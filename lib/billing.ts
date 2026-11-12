import "server-only";
import { audit } from "./audit";
import { notifyUser } from "./notify";
import { applyConfirmedPayment } from "./payments";
import { getPlans, xaf } from "./plans";
import { sasAmount, saspay, saspayKey, SasPayError } from "./saspay";
import { adminClient } from "./supabase/admin";

/**
 * Paiement des formules avec SasPay, de bout en bout :
 * 1. « Payer » crée une session de checkout SasPay au nom du client connecté (son e-mail, son
 *    identifiant en métadonnée) et un paiement `pending` lié à son compte (`payments`).
 * 2. Au retour du client, à chaque notification SasPay et à l'ouverture de la page Abonnement,
 *    MiniSoft relit chez SasPay le statut de la session puis vérifie la transaction
 *    (`/payments/{id}/verify/` = SUCCESS, en XAF, montant demandé ≥ prix de la formule).
 * 3. Seulement alors la formule est activée (réservation atomique : une seule activation).
 */

export const PROVIDER = "saspay";
const PENDING_MAX_AGE_MS = 3 * 86400_000;
const REUSE_MS = 25 * 60_000;

type PaymentRow = { id: string; user_id: string; plan_id: string; provider_ref: string; amount_xaf: number; status: string; created_at: string; details: Record<string, unknown> | null };

export const billingEnabled = () => saspayKey() !== null;

/** Crée (ou réutilise) la session de paiement SasPay de la formule et renvoie son adresse. */
export async function startPlanCheckout(user: { id: string; email: string; full_name: string }, planId: string, origin: string): Promise<string> {
  const plan = (await getPlans()).find((p) => p.id === planId);
  if (!plan || !plan.price_xaf) throw new SasPayError(400, "invalid_plan", "Formule introuvable.");
  const db = adminClient();
  const { data: recent } = await db.from("payments").select("id,user_id,plan_id,provider_ref,amount_xaf,status,created_at,details").eq("provider", PROVIDER).eq("user_id", user.id).eq("plan_id", plan.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1);
  const prev = (recent?.[0] ?? null) as PaymentRow | null;
  if (prev && prev.amount_xaf === plan.price_xaf && Date.now() - Date.parse(prev.created_at) < REUSE_MS && typeof prev.details?.checkout_url === "string") {
    const state = await reconcilePayment(prev);
    if (state === "pending") return prev.details.checkout_url as string;
    if (state === "succeeded") return `${origin}/espace/abonnement?paiement=ok`;
  }
  const session = await saspay.createCheckout({
    amount: plan.price_xaf,
    currency: "XAF",
    description: `MiniSoft RCA · formule ${plan.name} (1 mois)`,
    customer_email: user.email,
    customer_name: (user.full_name || user.email.split("@")[0] || "Client MiniSoft").slice(0, 120),
    return_url: `${origin}/espace/abonnement?paiement=retour`,
    metadata: { user_id: user.id, plan_id: plan.id, source: "minisoft-abonnement" },
  });
  if (!session?.id || !session.checkout_url) throw new SasPayError(502, "no_url", "SasPay n'a pas renvoyé de page de paiement.");
  const { error } = await db.from("payments").insert({ user_id: user.id, plan_id: plan.id, provider: PROVIDER, provider_ref: session.id, amount_xaf: plan.price_xaf, status: "pending", details: { checkout_url: session.checkout_url, currency: "XAF" } });
  if (error) throw new SasPayError(500, "db", "Impossible d'enregistrer le paiement. Réessayez.");
  await audit("billing.checkout", { actorId: user.id, details: { plan: plan.id, amount: plan.price_xaf, session: session.id } });
  return session.checkout_url;
}

/** Relit le paiement chez SasPay et active la formule si (et seulement si) SasPay le confirme. */
export async function reconcilePayment(pay: PaymentRow): Promise<"succeeded" | "pending" | "failed"> {
  if (pay.status !== "pending") return pay.status === "succeeded" ? "succeeded" : "failed";
  const db = adminClient();
  const status = await saspay.sessionStatus(pay.provider_ref);
  const s = String(status.status || "").toUpperCase();
  if (s === "PAID" && status.transaction_id) {
    const tx = await saspay.verify(status.transaction_id);
    const amount = sasAmount(tx.requested_amount);
    const ok = String(tx.status).toUpperCase() === "SUCCESS" && String(tx.currency).toUpperCase() === "XAF" && Number.isFinite(amount) && amount >= pay.amount_xaf && String(tx.flow_direction ?? "INBOUND").toUpperCase() === "INBOUND";
    if (!ok) {
      await audit("billing.mismatch", { actorId: pay.user_id, level: "warning", details: { payment: pay.id, status: tx.status, currency: tx.currency, amount: tx.requested_amount, expected: pay.amount_xaf } });
      return "pending";
    }
    const r = await applyConfirmedPayment(PROVIDER, { providerRef: pay.provider_ref, status: "succeeded", amountXaf: Math.floor(amount), details: { transaction_id: tx.id, transaction_reference: tx.reference ?? status.transaction_reference ?? null, net_amount: tx.net_amount ?? null } });
    if (r.applied && r.userId) await onActivated(r.userId, r.planId!, pay.amount_xaf);
    return "succeeded";
  }
  if (["EXPIRED", "CANCELLED", "CANCELED", "FAILED"].includes(s) || Date.now() - Date.parse(pay.created_at) > PENDING_MAX_AGE_MS) {
    await db.from("payments").update({ status: "failed", details: { ...(pay.details ?? {}), closed: s || "expired" }, updated_at: new Date().toISOString() }).eq("id", pay.id).eq("status", "pending");
    return "failed";
  }
  return "pending";
}

/** Vérifie les paiements SasPay en attente (d'un client, ou de tous après une notification). */
export async function reconcilePending(opts: { userId?: string; limit?: number } = {}) {
  if (!billingEnabled()) return { checked: 0, activated: 0, pending: 0 };
  let q = adminClient().from("payments").select("id,user_id,plan_id,provider_ref,amount_xaf,status,created_at,details").eq("provider", PROVIDER).eq("status", "pending").order("created_at", { ascending: false }).limit(opts.limit ?? 20);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data } = await q;
  let activated = 0;
  let pending = 0;
  for (const p of (data ?? []) as PaymentRow[]) {
    try {
      const r = await reconcilePayment(p);
      if (r === "succeeded") activated++;
      if (r === "pending") pending++;
    } catch (e) {
      pending++;
      await audit("billing.check_failed", { actorId: p.user_id, level: "warning", details: { payment: p.id, error: e instanceof Error ? e.message : String(e) } });
    }
  }
  return { checked: data?.length ?? 0, activated, pending };
}

async function onActivated(userId: string, planId: string, amount: number) {
  const plans = await getPlans({ includeInactive: true });
  const name = plans.find((p) => p.id === planId)?.name ?? planId;
  await audit("billing.activated", { actorId: userId, details: { plan: planId, amount } });
  await notifyUser(userId, { type: "info", title: `Formule ${name} activée`, body: `Paiement de ${xaf(amount)} confirmé par SasPay. Votre logiciel est débloqué.`, link: "/espace" });
  // Prévient les administrateurs de la plateforme (ADMIN_EMAILS).
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.length) return;
  const db = adminClient();
  const [{ data: who }, { data: staff }] = await Promise.all([db.from("profiles").select("email,full_name").eq("id", userId).maybeSingle(), db.from("profiles").select("id,email").in("email", admins)]);
  for (const a of staff ?? []) {
    if (a.id === userId) continue;
    await notifyUser(a.id as string, { type: "info", title: `Nouveau paiement : ${xaf(amount)}`, body: `${who?.full_name || who?.email || "Un client"} est passé en ${name} (vérifié auprès de SasPay).`, link: `/admin/utilisateurs/${userId}` });
  }
}
