import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { clientIp } from "@/lib/client-ip";
import { notifyStaff } from "@/lib/notify";
import { OpError, runOp } from "@/lib/transport/engine";
import { publicCompany, publicCtx, publicInfo } from "@/lib/transport/public";
import { limited } from "@/lib/venue/public";

type Ctx = { params: Promise<{ slug: string }> };

/** Informations publiques de l'entreprise (zones, types de colis, options de paiement). */
export const GET = route(async (req, { params }: Ctx) => {
  const { slug } = await params;
  if (limited(`tr:${clientIp(req)}`, 120)) throw new HttpError(429, "Trop de requêtes : patientez un instant.");
  const p = await publicCompany(slug, new URL(req.url).searchParams.get("test") === "1");
  return NextResponse.json(publicInfo(p), { headers: { "cache-control": "no-store" } });
});

/** Prix avant validation (`quote`) ou demande de livraison (`request`) : sans compte, avec limite d'essais. */
export const POST = route(async (req, { params }: Ctx) => {
  const { slug } = await params;
  const b = z.object({ demo: z.boolean().optional(), action: z.enum(["quote", "request"]), data: z.unknown() }).parse(await readJson(req, 60_000));
  if (limited(b.action === "request" ? `tr-order:${clientIp(req)}` : `tr-quote:${clientIp(req)}`, b.action === "request" ? 6 : 40)) throw new HttpError(429, "Trop de demandes en peu de temps : patientez une minute.");
  const p = await publicCompany(slug, b.demo === true);
  try {
    const r = await runOp(publicCtx(p), b.action === "quote" ? "order.quote" : "order.request", b.data);
    if (b.action === "request" && !p.demo && r.id) await notifyStaff(p.project.id, ["livraisons"], { type: "info", title: `Nouvelle demande de livraison ${r.number}`, body: "Reçue depuis la page publique." });
    return NextResponse.json({ ok: true, message: r.message, number: r.number, tracking: r.tracking, data: r.data });
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
