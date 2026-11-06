import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { OpError } from "@/lib/venue/engine";
import { clientIp, limited, publicCtx, publicMenu, publicRestaurant, runOp } from "@/lib/venue/public";
import { startZpPayment } from "@/lib/venue/zp-flow";
import { ZpError } from "@/lib/zingopay";

type Ctx = { params: Promise<{ slug: string }> };
const tok = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).nullish();

/** Menu public du restaurant (aucune connexion). `t` : jeton de table du QR code ; `q` : QR du menu général. */
export const GET = route(async (req, { params }: Ctx) => {
  const { slug } = await params;
  if (limited(`menu:${clientIp(req)}`, 120)) throw new HttpError(429, "Trop de requêtes : patientez un instant.");
  const url = new URL(req.url);
  const t = tok.safeParse(url.searchParams.get("t"));
  const q = tok.safeParse(url.searchParams.get("q"));
  const p = await publicRestaurant(slug, url.searchParams.get("demo") === "1");
  const menu = await publicMenu(p, t.success ? (t.data ?? null) : "invalide", q.success ? (q.data ?? null) : "invalide");
  return NextResponse.json(menu, { headers: { "cache-control": "no-store" } });
});

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("order"), demo: z.boolean().optional(), order: z.unknown() }),
  z.object({ action: z.literal("stat"), demo: z.boolean().optional(), stat: z.unknown() }),
]);

/** Commande du client et statistiques anonymes du menu. */
export const POST = route(async (req, { params }: Ctx) => {
  const { slug } = await params;
  const input = body.parse(await readJson(req, 40_000));
  const ip = clientIp(req);
  if (limited(`${input.action}:${ip}`, input.action === "order" ? 8 : 30)) throw new HttpError(429, input.action === "order" ? "Trop de commandes en peu de temps : patientez une minute." : "Trop de requêtes.");
  const p = await publicRestaurant(slug, input.demo === true);
  try {
    if (input.action === "stat") {
      await runOp(publicCtx(p), "online.stat", input.stat);
      return NextResponse.json({ ok: true });
    }
    const r = await runOp(publicCtx(p), "online.order", input.order);
    if (!r.secret) throw new HttpError(500, "Commande enregistrée sans lien de suivi.");
    let pay_url: string | null = null;
    let pay_error: string | null = null;
    if ((input.order as { pay?: string } | null)?.pay === "zingopay" && r.id) {
      try {
        pay_url = await startZpPayment(p, r.id);
      } catch (e) {
        pay_error = e instanceof ZpError || e instanceof OpError ? e.message : "Le paiement ZingoPay n'a pas pu être créé.";
      }
    }
    return NextResponse.json({ ok: true, message: r.message, tracking: r.secret, duplicate: Boolean(r.duplicate), pay_url, pay_error });
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
