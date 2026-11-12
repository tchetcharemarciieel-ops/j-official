import "server-only";
import { audit } from "../audit";
import { notifyStaff } from "../notify";
import { orderReference, zp, ZpError, type ZpPayment } from "../zingopay";
import type { Doc } from "./model";
import type { FullOrder } from "./online";
import { runOp, zpInternalCtx, type PublicCtx } from "./public";

/**
 * Parcours ZingoPay d'une commande du menu QR : création du paiement au montant exact, puis
 * vérification du statut auprès de ZingoPay. Seule une réponse « paid » de ZingoPay, avec la
 * même référence et le même montant, marque la commande payée.
 */

async function order(p: PublicCtx, orderId: string) {
  return (await p.store.get("order", orderId)) as Doc<FullOrder> | null;
}

/** Crée (ou retrouve) le paiement ZingoPay de la commande et renvoie son lien. */
export async function startZpPayment(p: PublicCtx, orderId: string): Promise<string> {
  if (!p.zp) throw new ZpError(409, "disabled", "Le paiement ZingoPay n'est pas activé par ce restaurant.");
  const o = await order(p, orderId);
  if (!o || o.data.pay_mode !== "zingopay") throw new ZpError(404, "not_found", "Commande introuvable.");
  if (o.data.pay_status === "paye") throw new ZpError(409, "paid", "Cette commande est déjà payée.");
  const usable = o.data.zp && o.data.zp.status === "pending" && (!o.data.zp.expires_at || Date.parse(o.data.zp.expires_at) > Date.now() + 60_000);
  if (usable) return o.data.zp!.pay_url;
  const reference = orderReference(o.id, p.demo);
  let pay: ZpPayment;
  try {
    pay = await zp.create(p.zp.apiKey, { amount: o.data.total, reference, description: `${p.name} · commande ${o.data.number}`.slice(0, 120), expires_in_minutes: 45 });
  } catch (e) {
    // Paiement précédent expiré pour la même référence : on vérifie son statut plutôt que d'en recréer un.
    if (e instanceof ZpError && e.code === "reference_conflict") {
      const prev = await zp.byReference(p.zp.apiKey, reference);
      if (prev) pay = prev;
      else throw e;
    } else throw e;
  }
  if (!pay.pay_url) throw new ZpError(502, "no_url", "ZingoPay n'a pas renvoyé de lien de paiement.");
  await runOp(zpInternalCtx(p), "online.zp_attach", { order_id: o.id, zp: { id: pay.id, pay_url: pay.pay_url, status: pay.status, expires_at: pay.expires_at, mode: p.zp.mode } });
  if (pay.status === "paid") await confirmIfPaid(p, o.id, pay);
  return pay.pay_url;
}

/** Relit le statut chez ZingoPay et marque la commande payée si (et seulement si) ZingoPay le confirme. */
export async function verifyZpOrder(p: PublicCtx, orderId: string): Promise<"paid" | "pending" | "expired" | "cancelled" | "none"> {
  if (!p.zp) return "none";
  const o = await order(p, orderId);
  if (!o?.data.zp) return "none";
  if (o.data.pay_status === "paye") return "paid";
  const pay = await zp.get(p.zp.apiKey, o.data.zp.id);
  if (pay.status === "paid") return (await confirmIfPaid(p, o.id, pay)) ? "paid" : "pending";
  return pay.status;
}

async function confirmIfPaid(p: PublicCtx, orderId: string, pay: ZpPayment) {
  const o = await order(p, orderId);
  if (!o) return false;
  const reference = orderReference(o.id, p.demo);
  if (pay.status !== "paid" || pay.reference !== reference || pay.amount_xaf !== o.data.total) {
    await audit("zingopay.mismatch", { projectId: p.project.id, level: "warning", details: { order: o.data.number, status: pay.status, reference: pay.reference, expected: reference, amount: pay.amount_xaf, total: o.data.total } });
    return false;
  }
  const already = o.data.pay_status === "paye";
  await runOp(zpInternalCtx(p), "online.zp_paid", { order_id: o.id, payment_id: pay.id, amount: pay.amount_xaf, receipt: pay.payment_reference, paid_at: pay.paid_at });
  if (!already && !p.demo) await notifyStaff(p.project.id, ["caisse", "finances"], { type: "info", title: `Paiement ZingoPay reçu : ${o.data.number}`, body: `${pay.amount_xaf.toLocaleString("fr-FR")} FCFA, vérifié auprès de ZingoPay.`, link: `/apps/${p.project.slug}` });
  return true;
}
