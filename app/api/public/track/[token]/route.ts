import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { OpError } from "@/lib/venue/engine";
import { clientIp, limited, publicCtx, publicRestaurant, runOp, trackOrder } from "@/lib/venue/public";
import { startZpPayment, verifyZpOrder } from "@/lib/venue/zp-flow";
import { ZpError } from "@/lib/zingopay";
import type { Doc } from "@/lib/venue/model";
import type { FullOrder } from "@/lib/venue/online";
import { validSub, vapidKeys } from "@/lib/push";
import { pushOrderUpdates, savePushSubscription } from "@/lib/venue/order-push";

type Ctx = { params: Promise<{ token: string }> };

/** Suivi d'une commande par son lien secret : seulement la commande concernée, sans données privées. */
export const GET = route(async (req, { params }: Ctx) => {
  const { token } = await params;
  if (limited(`track:${clientIp(req)}`, 90)) throw new HttpError(429, "Trop de requêtes : patientez un instant.");
  const url = new URL(req.url);
  const p = await publicRestaurant(url.searchParams.get("r") ?? "", url.searchParams.get("demo") === "1");
  const order = await trackOrder(p, token);
  if (!order) throw new HttpError(404, "Commande introuvable : vérifiez votre lien de suivi.");
  return NextResponse.json({ order, restaurant: { name: p.name, primary: p.primary }, demo: p.demo, push_key: vapidKeys()?.publicKey ?? null }, { headers: { "cache-control": "no-store" } });
});

/**
 * Actions du client sur sa commande :
 * - demo_pay : mode démonstration uniquement, simule la confirmation du paiement ;
 * - zp_start : (re)crée le lien de paiement ZingoPay au montant exact ;
 * - zp_check : relit le statut chez ZingoPay ; la commande n'est payée que si ZingoPay le confirme.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const { token } = await params;
  const input = z.object({ action: z.enum(["demo_pay", "zp_start", "zp_check", "push_subscribe"]), r: z.string().max(70), demo: z.boolean().optional(), subscription: z.unknown().optional() }).parse(await readJson(req, 4_000));
  if (limited(`track-${input.action}:${clientIp(req)}`, input.action === "zp_check" ? 30 : 10)) throw new HttpError(429, "Trop de demandes : patientez un instant.");
  try {
    if (input.action === "demo_pay") {
      const p = await publicRestaurant(input.r, true);
      const r = await runOp(publicCtx(p), "online.demo_pay", { tracking_token: token });
      void pushOrderUpdates(p.project.id, true, () => p.store.list("order"));
      return NextResponse.json({ ok: true, message: r.message });
    }
    const p = await publicRestaurant(input.r, input.demo === true);
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new HttpError(404, "Commande introuvable.");
    const o = ((await p.store.list("order")) as Doc<FullOrder>[]).find((x) => x.data.tracking_token === token);
    if (!o) throw new HttpError(404, "Commande introuvable.");
    if (input.action === "push_subscribe") {
      if (!validSub(input.subscription)) throw new HttpError(400, "Abonnement aux notifications invalide.");
      const back = `/r/${encodeURIComponent(input.r)}/suivi/${token}${p.demo ? "?demo=1" : ""}`;
      await savePushSubscription(p.project.id, p.demo, o, input.subscription, back, p.name).catch((e: Error) => {
        throw new HttpError(429, e.message);
      });
      return NextResponse.json({ ok: true });
    }
    if (input.action === "zp_start") return NextResponse.json({ ok: true, pay_url: await startZpPayment(p, o.id) });
    return NextResponse.json({ ok: true, status: await verifyZpOrder(p, o.id) });
  } catch (e) {
    if (e instanceof OpError || e instanceof ZpError) return NextResponse.json({ error: e.message }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 });
    throw e;
  }
});
