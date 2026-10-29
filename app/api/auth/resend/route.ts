import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/config";

const body = z.object({ email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(200), next: z.string().max(300).regex(/^\/(?!\/)/).default("/espace") });

/** Renvoi de l'e-mail de confirmation, fait par le serveur. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const input = body.parse(await readJson(req));
  const { error } = await (await createClient()).auth.resend({ type: "signup", email: input.email, options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(input.next)}` } });
  if (error) {
    if (/rate limit|too many|seconds/i.test(error.message)) throw new HttpError(429, "Trop d'e-mails envoyés pour le moment. Réessayez dans quelques minutes.");
    if (/sending.*email|smtp/i.test(error.message)) {
      console.error("[auth] envoi de l'e-mail impossible (réglage SMTP de Supabase) :", error.message);
      throw new HttpError(503, "L'e-mail de vérification n'a pas pu être envoyé. Le service d'envoi d'e-mails est mal réglé : réessayez plus tard.");
    }
    console.error("[auth/resend] échec Supabase :", error.status, error.message);
    throw new HttpError(503, "Envoi impossible pour le moment. Réessayez dans un instant.");
  }
  return NextResponse.json({ ok: true });
});
