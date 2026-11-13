import { NextResponse } from "next/server";
import { serverConfigured } from "@/lib/config";
import { clientIp, limited } from "@/lib/venue/public";
import { collect, type CollectInput } from "@/lib/website/server";

/**
 * Réception des visites envoyées par le code de suivi (public/ms.js) installé sur le site d'une
 * entreprise. Accepté seulement depuis le domaine du site connecté ; aucun cookie, aucune IP stockée.
 */
const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" };

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  if (!serverConfigured()) return new NextResponse(null, { status: 503, headers: cors });
  const ip = clientIp(req);
  if (limited(`collect:${ip}`, 240)) return new NextResponse(null, { status: 429, headers: cors });
  const raw = await req.text().catch(() => "");
  if (raw.length > 4000) return new NextResponse(null, { status: 413, headers: cors });
  let input: CollectInput;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    return new NextResponse(null, { status: 400, headers: cors });
  }
  const r = await collect(input, {
    origin: req.headers.get("origin"),
    referer: req.headers.get("referer"),
    ua: (req.headers.get("user-agent") ?? "").slice(0, 400),
    ip,
    country: req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country"),
  }).catch(() => ({ ok: false as const, status: 500, reason: "erreur" }));
  return new NextResponse(null, { status: r.ok ? 204 : r.status, headers: cors });
}
