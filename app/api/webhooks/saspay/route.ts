import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { audit } from "@/lib/audit";
import { reconcilePending } from "@/lib/billing";
import { validSasSignature } from "@/lib/saspay";
import { clientIp, limited } from "@/lib/venue/public";

/**
 * Notification SasPay (Tableau de bord SasPay → Webhooks, événement `transaction.success`).
 * La notification seule ne prouve rien : si `SASPAY_WEBHOOK_SECRET` est configuré, la signature
 * (X-Webhook-Signature / X-Webhook-Timestamp) est exigée ; dans tous les cas, MiniSoft relit
 * ensuite chaque paiement en attente chez SasPay avec sa clé avant d'activer une formule.
 */
export const POST = route(async (req) => {
  if (limited(`saspay-hook:${clientIp(req)}`, 60)) throw new HttpError(429, "Trop de requêtes.");
  const raw = await req.text();
  if (raw.length > 64_000) throw new HttpError(413, "Notification trop volumineuse.");
  const secret = (process.env.SASPAY_WEBHOOK_SECRET || "").trim();
  if (secret && !validSasSignature(raw, req.headers.get("x-webhook-signature"), req.headers.get("x-webhook-timestamp"), secret)) {
    await audit("saspay.notification", { level: "warning", details: { result: "refusée : signature invalide ou expirée" } });
    return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  }
  let event = "";
  let txId = "";
  try {
    const body = JSON.parse(raw) as { event?: string; data?: { id?: string } };
    event = String(body.event ?? req.headers.get("x-webhook-event") ?? "");
    txId = String(body.data?.id ?? "").slice(0, 80);
  } catch {
    throw new HttpError(400, "JSON invalide.");
  }
  if (event === "webhook.test") {
    await audit("saspay.notification", { details: { result: "test reçu", signed: Boolean(secret) } });
    return NextResponse.json({ received: true, test: true });
  }
  if (event !== "transaction.success") return NextResponse.json({ received: true, processed: false });
  const r = await reconcilePending({ limit: 30 });
  await audit("saspay.notification", { details: { result: "vérifiée auprès de SasPay", event, transaction: txId, ...r } });
  return NextResponse.json({ received: true, ...r });
});
