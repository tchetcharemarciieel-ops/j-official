import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { OpError } from "@/lib/venue/engine";
import { clientIp, limited, publicCtx, publicRestaurant, runOp, trackOrder } from "@/lib/venue/public";

type Ctx = { params: Promise<{ token: string }> };

/** Suivi d'une commande par son lien secret : seulement la commande concernée, sans données privées. */
export const GET = route(async (req, { params }: Ctx) => {
  const { token } = await params;
  if (limited(`track:${clientIp(req)}`, 90)) throw new HttpError(429, "Trop de requêtes : patientez un instant.");
  const url = new URL(req.url);
  const p = await publicRestaurant(url.searchParams.get("r") ?? "", url.searchParams.get("demo") === "1");
  const order = await trackOrder(p, token);
  if (!order) throw new HttpError(404, "Commande introuvable : vérifiez votre lien de suivi.");
  return NextResponse.json({ order, restaurant: { name: p.name, primary: p.primary }, demo: p.demo }, { headers: { "cache-control": "no-store" } });
});

/** Mode démonstration uniquement : simule la confirmation officielle du paiement. */
export const POST = route(async (req, { params }: Ctx) => {
  const { token } = await params;
  const input = z.object({ action: z.literal("demo_pay"), r: z.string().max(70) }).parse(await readJson(req, 2_000));
  const p = await publicRestaurant(input.r, true);
  try {
    const r = await runOp(publicCtx(p), "online.demo_pay", { tracking_token: token });
    return NextResponse.json({ ok: true, message: r.message });
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
