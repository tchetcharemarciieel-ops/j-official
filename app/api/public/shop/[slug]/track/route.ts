import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { clientIp } from "@/lib/client-ip";
import { findOrder, publicOrder, publicShop, verifyZpOrder } from "@/lib/shop/public";
import { limited } from "@/lib/venue/public";
import { ZpError } from "@/lib/zingopay";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Suivi d'une commande : par lien secret (jeton reçu à la commande), ou numéro de commande +
 * téléphone de la commande. Essais limités pour empêcher de deviner un numéro. Si le paiement
 * ZingoPay est en attente, son statut est relu chez ZingoPay à chaque consultation.
 */
export const GET = route(async (req, { params }: Ctx) => {
  const { slug } = await params;
  if (limited(`shop-track:${clientIp(req)}`, 20)) throw new HttpError(429, "Trop d'essais : patientez une minute.");
  const u = new URL(req.url);
  const p = await publicShop(slug, u.searchParams.get("test") === "1");
  let o = await findOrder(p, { token: u.searchParams.get("t"), number: u.searchParams.get("n"), phone: u.searchParams.get("p") });
  if (!o) throw new HttpError(404, "Commande introuvable. Vérifiez le numéro et le téléphone utilisé pour la commande.");
  if (o.data.pay_mode === "zingopay" && o.data.pay_status !== "paye" && o.data.status !== "annulee") {
    await verifyZpOrder(p, o.id).catch((e) => (e instanceof ZpError ? null : Promise.reject(e)));
    o = (await p.store.get("order", o.id)) as typeof o;
  }
  return NextResponse.json(publicOrder(o!, p.settings.name), { headers: { "cache-control": "no-store" } });
});
