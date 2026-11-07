import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { serverRestaurant } from "@/lib/venue/public";
import { verifyZpOrder } from "@/lib/venue/zp-flow";
import { clientIp, limited } from "@/lib/venue/public";
import type { Doc } from "@/lib/venue/model";
import type { FullOrder } from "@/lib/venue/online";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Écran « Commandes en ligne » : relit chez ZingoPay le statut des commandes ZingoPay non payées
 * des 3 dernières heures. Une commande n'est marquée payée que si ZingoPay le confirme
 * (même référence, même montant) : un membre de l'équipe ne peut rien forcer ici.
 */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { project, role } = await getAccess(id);
  if (role === "viewer") throw new HttpError(403, "Action non autorisée.");
  if (limited(`zpcheck:${id}:${clientIp(req)}`, 20)) return NextResponse.json({ checked: 0, paid: 0, throttled: true });
  const input = z.object({ mode: z.enum(["live", "demo"]).default("live") }).parse(await readJson(req, 500));
  const p = await serverRestaurant(project.slug, input.mode === "demo");
  if (!p.zp) return NextResponse.json({ checked: 0, paid: 0, configured: false });
  const since = Date.now() - 3 * 3_600_000;
  const pending = ((await p.store.list("order")) as Doc<FullOrder>[])
    .filter((o) => o.data.pay_mode === "zingopay" && o.data.zp && o.data.pay_status !== "paye" && o.data.status !== "annulee" && Date.parse(o.created_at) >= since)
    .slice(0, 10);
  let paid = 0;
  for (const o of pending) if ((await verifyZpOrder(p, o.id).catch(() => "none")) === "paid") paid++;
  return NextResponse.json({ checked: pending.length, paid, configured: true });
});
