import "server-only";
import { NextResponse } from "next/server";
import { audit } from "../audit";
import { parseReference, validSignature, ZpError } from "../zingopay";
import type { Doc, Order } from "./model";
import { serverShop, verifyZpOrder, type PublicShop } from "./public";

const redact = (s: string) => s.replace(/zp_(test|live)_[A-Za-z0-9_-]+/g, "zp_$1_[masqué]");

/**
 * Notification ZingoPay d'une boutique MiniSoft Shop. Elle seule ne prouve rien : signature
 * vérifiée si la boutique a enregistré son secret, puis statut relu chez ZingoPay avec la clé de
 * la boutique avant de marquer la commande payée. Renvoie null si le logiciel n'est pas une boutique.
 */
export async function handleShopWebhook(slug: string, raw: string, signature: string | null): Promise<NextResponse | null> {
  const base = await serverShop(slug, false).catch(() => null);
  if (!base) return null;
  const log = (result: string, extra: Record<string, unknown> = {}, level: "info" | "warning" = "info") => audit("zingopay.notification", { projectId: base.project.id, level, details: { module: "shop", result, ...extra } });
  if (!base.zp) {
    await log("ignorée : ZingoPay n'est pas configuré pour cette boutique", { body: redact(raw).slice(0, 2000) }, "warning");
    return NextResponse.json({ received: true, processed: false });
  }
  if (base.zp.webhookSecret && !validSignature(raw, signature, base.zp.webhookSecret)) {
    await log("refusée : signature ZingoPay invalide ou expirée", {}, "warning");
    return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  }
  let event: { type?: string; data?: { id?: string; reference?: string | null; amount_xaf?: number } };
  try {
    event = JSON.parse(raw);
  } catch {
    await log("ignorée : corps illisible", { body: redact(raw).slice(0, 500) }, "warning");
    return NextResponse.json({ received: true, processed: false });
  }
  const summary = { type: event.type ?? null, id: event.data?.id ?? null, reference: event.data?.reference ?? null, amount: event.data?.amount_xaf ?? null, signed: Boolean(base.zp.webhookSecret) };
  if (event.type === "payment.test") {
    await log("test reçu", summary);
    return NextResponse.json({ received: true, test: true });
  }
  if (event.type !== "payment.paid") {
    await log("ignorée : type d'événement non traité", summary);
    return NextResponse.json({ received: true, processed: false });
  }
  const ref = parseReference(event.data?.reference);
  if (!ref) {
    await log("reçue : paiement sans commande MiniSoft, à rapprocher par l'équipe", summary);
    return NextResponse.json({ received: true, processed: false });
  }
  const p: PublicShop = ref.demo ? ((await serverShop(slug, true)) ?? base) : base;
  const order = (await p.store.get("order", ref.orderId)) as Doc<Order> | null;
  if (!order) {
    await log("ignorée : commande introuvable", summary, "warning");
    return NextResponse.json({ received: true, processed: false });
  }
  try {
    const status = await verifyZpOrder(p, order.id);
    await log(status === "paid" ? `commande ${order.data.number} payée (statut vérifié chez ZingoPay)` : `statut ZingoPay « ${status} » : commande non marquée payée`, { ...summary, order: order.data.number, demo: ref.demo }, status === "paid" ? "info" : "warning");
    return NextResponse.json({ received: true, status });
  } catch (e) {
    await log("erreur pendant la vérification", { ...summary, error: e instanceof Error ? e.message : String(e) }, "warning");
    if (e instanceof ZpError && e.status >= 500) return NextResponse.json({ error: "Vérification impossible pour le moment." }, { status: 503 });
    return NextResponse.json({ received: true, processed: false });
  }
}
