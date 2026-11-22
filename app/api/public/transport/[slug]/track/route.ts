import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { clientIp } from "@/lib/client-ip";
import { publicCompany, trackOrder } from "@/lib/transport/public";
import { limited } from "@/lib/venue/public";

type Ctx = { params: Promise<{ slug: string }> };

/** Suivi par numéro de suivi : statut, progression, date estimée ; jamais d'information privée. Essais limités. */
export const GET = route(async (req, { params }: Ctx) => {
  const { slug } = await params;
  if (limited(`tr-track:${clientIp(req)}`, 20)) throw new HttpError(429, "Trop d'essais : patientez une minute.");
  const u = new URL(req.url);
  const p = await publicCompany(slug, u.searchParams.get("test") === "1");
  const t = await trackOrder(p, u.searchParams.get("n") ?? "");
  if (!t) throw new HttpError(404, "Numéro de suivi introuvable. Vérifiez-le (il commence par TR).");
  return NextResponse.json(t, { headers: { "cache-control": "no-store" } });
});
