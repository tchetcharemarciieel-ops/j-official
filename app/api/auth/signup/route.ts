import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/config";
import { audit } from "@/lib/audit";

const body = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(200),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(200),
  fullName: z.string().trim().max(80).default(""),
  website: z.string().max(0).optional(), // champ piège anti-robots, doit rester vide
  next: z.string().max(300).regex(/^\/(?!\/)/).default("/espace"),
});

// Limite simple par adresse IP (par instance du serveur) contre les créations en masse.
const attempts = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > 5;
}

/**
 * Inscription : le compte est créé non confirmé et Supabase envoie un e-mail de confirmation.
 * Le lien ramène sur /auth/callback, qui ouvre la session et mène à l'espace client.
 * La connexion reste refusée tant que l'adresse n'est pas confirmée.
 */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (limited(ip)) throw new HttpError(429, "Trop d'inscriptions depuis cet appareil. Réessayez dans une heure.");
  const input = body.parse(await readJson(req));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(input.next)}`, data: { full_name: input.fullName } },
  });
  if (error) {
    if (/already|exists|registered/i.test(error.message)) throw new HttpError(409, "Un compte existe déjà avec cette adresse. Connectez-vous.");
    if (/rate limit|too many/i.test(error.message)) throw new HttpError(429, "Trop d'e-mails envoyés pour le moment. Réessayez dans quelques minutes.");
    if (/password/i.test(error.message)) throw new HttpError(400, "Mot de passe trop faible : utilisez au moins 8 caractères avec lettres et chiffres.");
    console.error("[auth/signup] échec Supabase :", error.status, error.message);
    if (/invalid.*email|email.*invalid/i.test(error.message)) throw new HttpError(400, "Inscription impossible. Vérifiez l'adresse e-mail.");
    throw new HttpError(503, "Le service d'inscription ne répond pas pour le moment. Réessayez dans un instant.");
  }
  // Adresse déjà inscrite et confirmée : Supabase ne renvoie aucune identité (et n'envoie pas d'e-mail).
  if (data.user && data.user.identities?.length === 0) throw new HttpError(409, "Un compte existe déjà avec cette adresse. Connectez-vous.");
  await audit("account.created", { details: { email: input.email, confirmation: data.session ? "désactivée dans Supabase" : "e-mail envoyé" } });
  return NextResponse.json({ ok: true, confirmationRequired: !data.session });
});
