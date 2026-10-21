import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

const body = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(200),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(200),
  fullName: z.string().trim().max(80).default(""),
  website: z.string().max(0).optional(), // champ piège anti-robots, doit rester vide
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
 * Inscription côté serveur : le compte est créé déjà validé, sans e-mail de confirmation.
 * Les invitations restent protégées par leur jeton secret, transmis par le propriétaire.
 */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (limited(ip)) throw new HttpError(429, "Trop d'inscriptions depuis cet appareil. Réessayez dans une heure.");
  const input = body.parse(await readJson(req));
  const { error } = await adminClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error) {
    if (/already|exists|registered/i.test(error.message)) throw new HttpError(409, "Un compte existe déjà avec cette adresse. Connectez-vous.");
    if (/password/i.test(error.message)) throw new HttpError(400, "Mot de passe trop faible : utilisez au moins 8 caractères avec lettres et chiffres.");
    throw new HttpError(400, "Inscription impossible. Vérifiez l'adresse e-mail.");
  }
  await audit("account.created", { details: { email: input.email } });
  return NextResponse.json({ ok: true });
});
