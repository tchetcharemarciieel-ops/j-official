import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

const body = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(200),
  password: z.string().min(1, "Mot de passe obligatoire.").max(200),
});

// Limite par adresse IP (par instance du serveur) contre les essais de mots de passe en série.
const attempts = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < 15 * 60 * 1000);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > 20;
}

/**
 * Connexion par e-mail et mot de passe, faite par le serveur : le téléphone n'a besoin de joindre
 * que le site (certains réseaux bloquent ou ralentissent l'accès direct au service d'authentification).
 * La session est enregistrée dans les cookies, comme avec la connexion depuis le navigateur.
 */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (limited(ip)) throw new HttpError(429, "Trop de tentatives. Patientez quelques minutes.");
  const input = body.parse(await readJson(req));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error) {
    const m = error.message;
    if (/invalid login|invalid credentials/i.test(m)) throw new HttpError(401, "E-mail ou mot de passe incorrect.");
    if (/email not confirmed/i.test(m)) throw new HttpError(403, "Votre adresse e-mail n'est pas encore vérifiée. Demandez un code ci-dessous puis saisissez-le.");
    if (/rate limit|too many/i.test(m)) throw new HttpError(429, "Trop de tentatives. Patientez quelques minutes.");
    console.error("[auth/login] échec Supabase :", error.status, m);
    throw new HttpError(503, "Le service de connexion ne répond pas pour le moment. Réessayez dans un instant.");
  }
  return NextResponse.json({ ok: true });
});
