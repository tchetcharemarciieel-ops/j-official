import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { audit } from "@/lib/audit";
import { adminClient } from "@/lib/supabase/admin";
import { clientIp, limited } from "@/lib/venue/public";

type Ctx = { params: Promise<{ slug: string }> };

/** Masque tout ce qui ressemble à une clé ZingoPay avant de l'enregistrer. */
const redact = (s: string) => s.replace(/zp_(test|live)_[A-Za-z0-9_-]+/g, "zp_$1_[masqué]");

async function project(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(slug)) throw new HttpError(404, "Restaurant introuvable.");
  const { data } = await adminClient().from("projects").select("id").eq("slug", slug).maybeSingle();
  if (!data) throw new HttpError(404, "Restaurant introuvable.");
  return data.id as string;
}

/**
 * Adresse de notification ZingoPay (phase de test). Elle enregistre seulement ce que ZingoPay
 * envoie, pour connaître le format réel de la notification : elle ne marque AUCUNE commande
 * payée. Le marquage « payé » viendra après la vérification du statut avec la clé, une fois la
 * documentation officielle de vérification connue.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const { slug } = await params;
  if (limited(`zingopay:${clientIp(req)}`, 30)) throw new HttpError(429, "Trop de requêtes.");
  const projectId = await project(slug);
  const raw = await req.text();
  if (raw.length > 16_000) throw new HttpError(413, "Notification trop volumineuse.");
  let body: unknown = redact(raw);
  try {
    body = JSON.parse(redact(raw));
  } catch {
    /* corps non JSON : gardé en texte */
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers) if (!/^(cookie|authorization)$/i.test(k) && !/^x-(forwarded|real|render|vercel)/i.test(k)) headers[k] = redact(v).slice(0, 300);
  const query = Object.fromEntries(new URL(req.url).searchParams);
  await audit("zingopay.notification", { projectId, level: "info", details: { verified: false, note: "Test : notification enregistrée, aucune commande marquée payée.", body, headers, query, ip: clientIp(req) } });
  return NextResponse.json({ received: true });
});

/** Ouverte dans un navigateur : confirme que l'adresse existe. */
export const GET = route(async (_req, { params }: Ctx) => {
  const { slug } = await params;
  await project(slug);
  return NextResponse.json({ ok: true, info: "Adresse de notification ZingoPay de MiniSoft RCA (test : enregistre les notifications sans marquer de paiement)." });
});
