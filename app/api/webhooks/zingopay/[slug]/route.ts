import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { audit } from "@/lib/audit";
import { clientIp, limited, serverRestaurant } from "@/lib/venue/public";
import { verifyZpOrder } from "@/lib/venue/zp-flow";
import { parseReference, validSignature, ZpError } from "@/lib/zingopay";
import type { Doc } from "@/lib/venue/model";
import type { FullOrder } from "@/lib/venue/online";

type Ctx = { params: Promise<{ slug: string }> };

/** Masque tout ce qui ressemble à une clé ZingoPay avant de l'enregistrer. */
const redact = (s: string) => s.replace(/zp_(test|live)_[A-Za-z0-9_-]+/g, "zp_$1_[masqué]");

/**
 * Notification ZingoPay du restaurant. La notification seule ne prouve rien : on vérifie la
 * signature (si le restaurant a enregistré son secret de signature), puis on relit le statut du
 * paiement chez ZingoPay avec la clé du restaurant avant de marquer la commande payée.
 * Répond toujours 2xx une fois la notification traitée, pour que ZingoPay ne la renvoie pas.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const { slug } = await params;
  if (limited(`zingopay:${clientIp(req)}`, 60)) throw new HttpError(429, "Trop de requêtes.");
  const raw = await req.text();
  if (raw.length > 32_000) throw new HttpError(413, "Notification trop volumineuse.");
  const base = await serverRestaurant(slug, false);
  const log = (result: string, extra: Record<string, unknown> = {}, level: "info" | "warning" = "info") =>
    audit("zingopay.notification", { projectId: base.project.id, level, details: { result, ...extra } });

  if (!base.zp) {
    await log("ignorée : ZingoPay n'est pas configuré pour ce restaurant", { body: redact(raw).slice(0, 2000) }, "warning");
    return NextResponse.json({ received: true, processed: false });
  }
  if (base.zp.webhookSecret && !validSignature(raw, req.headers.get("zingopay-signature"), base.zp.webhookSecret)) {
    await log("refusée : signature ZingoPay invalide ou expirée", {}, "warning");
    return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  }
  let event: { type?: string; data?: { id?: string; reference?: string | null; amount_xaf?: number; status?: string } };
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
    // Lien fixe (reference null) ou paiement créé hors de MiniSoft : à rapprocher par l'équipe.
    await log("reçue : paiement sans commande MiniSoft (lien fixe ?), à rapprocher en caisse", summary);
    return NextResponse.json({ received: true, processed: false });
  }
  const p = ref.demo ? await serverRestaurant(slug, true) : base;
  const order = (await p.store.get("order", ref.orderId)) as Doc<FullOrder> | null;
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
    // 503 : ZingoPay renverra la notification (3 essais).
    if (e instanceof ZpError && e.status >= 500) return NextResponse.json({ error: "Vérification impossible pour le moment." }, { status: 503 });
    return NextResponse.json({ received: true, processed: false });
  }
});

/** Ouverte dans un navigateur : confirme que l'adresse existe. */
export const GET = route(async (_req, { params }: Ctx) => {
  const { slug } = await params;
  const p = await serverRestaurant(slug, false);
  return NextResponse.json({ ok: true, info: "Adresse de notification ZingoPay de MiniSoft RCA.", configured: Boolean(p.zp) });
});
