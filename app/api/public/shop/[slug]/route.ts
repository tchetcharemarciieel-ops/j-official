import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { notifyStaff } from "@/lib/notify";
import { OpError } from "@/lib/shop/engine";
import { catalog, publicCtx, publicShop, startZpPayment } from "@/lib/shop/public";
import { runOp } from "@/lib/shop/engine";
import { clientIp } from "@/lib/client-ip";
import { limited } from "@/lib/venue/public";
import { ZpError } from "@/lib/zingopay";
import type { Doc, Order } from "@/lib/shop/model";

type Ctx = { params: Promise<{ slug: string }> };

/** Catalogue public de la boutique (aucune connexion). `demo=1` : aperçu réservé au propriétaire connecté. */
export const GET = route(async (req, { params }: Ctx) => {
  const { slug } = await params;
  if (limited(`shop:${clientIp(req)}`, 120)) throw new HttpError(429, "Trop de requêtes : patientez un instant.");
  const p = await publicShop(slug, new URL(req.url).searchParams.get("test") === "1");
  return NextResponse.json(await catalog(p), { headers: { "cache-control": "no-store" } });
});

/** Commande du client (sans compte). Paiement ZingoPay : le lien n'est donné qu'après création de la commande. */
export const POST = route(async (req, { params }: Ctx) => {
  const { slug } = await params;
  const input = z.object({ demo: z.boolean().optional(), order: z.unknown() }).parse(await readJson(req, 40_000));
  if (limited(`shop-order:${clientIp(req)}`, 6)) throw new HttpError(429, "Trop de commandes en peu de temps : patientez une minute.");
  const p = await publicShop(slug, input.demo === true);
  try {
    const r = await runOp(publicCtx(p), "public.order", input.order);
    if (!r.token || !r.id) throw new HttpError(500, "Commande enregistrée sans lien de suivi.");
    let pay_url: string | null = null;
    let pay_error: string | null = null;
    if ((input.order as { pay_mode?: string } | null)?.pay_mode === "zingopay") {
      try {
        pay_url = await startZpPayment(p, r.id);
      } catch (e) {
        pay_error = e instanceof ZpError || e instanceof OpError ? e.message : "Le paiement ZingoPay n'a pas pu être créé.";
      }
    }
    if (!p.demo && !r.duplicate) {
      const o = (await p.store.get("order", r.id)) as Doc<Order> | null;
      if (o) await notifyStaff(p.project.id, ["commandes", "caisse"], { type: "info", title: `Nouvelle commande en ligne : ${o.data.number}`, body: `${o.data.customer.name} · ${o.data.total.toLocaleString("fr-FR")} FCFA · ${o.data.mode === "livraison" ? "livraison" : "retrait"}${pay_url ? " · paiement ZingoPay en cours" : ""}`, link: `/apps/${p.project.slug}` });
    }
    return NextResponse.json({ ok: true, message: r.message, number: r.number, tracking: r.token, duplicate: Boolean(r.duplicate), pay_url, pay_error });
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
