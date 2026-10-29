import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

const body = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(200),
  code: z.string().trim().regex(/^\d{6,10}$/, "Saisissez le code à chiffres reçu par e-mail."),
});

// Limite des essais de code par adresse IP (par instance du serveur).
const attempts = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < 15 * 60 * 1000);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > 10;
}

/** Confirmation de l'adresse e-mail par le code reçu ; la session est ouverte dans les cookies. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const input = body.parse(await readJson(req));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (limited(`${ip}:${input.email}`)) throw new HttpError(429, "Trop d'essais. Patientez quelques minutes ou demandez un nouveau code.");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: input.email, token: input.code, type: "signup" });
  if (error) {
    if (/expired|invalid|otp/i.test(error.message)) throw new HttpError(400, "Code incorrect ou expiré. Vérifiez le dernier e-mail reçu ou demandez un nouveau code.");
    console.error("[auth/verify] échec Supabase :", error.status, error.message);
    throw new HttpError(503, "La vérification ne répond pas pour le moment. Réessayez dans un instant.");
  }
  await audit("account.confirmed", { details: { email: input.email, method: "code" } });
  return NextResponse.json({ ok: true });
});
