import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/** Demande d'assistance, problème signalé ou suggestion d'un client connecté (traité dans /admin/support). */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connexion requise.");
  const input = z
    .object({ subject: z.string().trim().min(3, "Précisez le sujet.").max(120), message: z.string().trim().min(10, "Décrivez votre demande en quelques mots.").max(2000), phone: z.string().trim().max(30).regex(/^[+0-9 ().-]*$/, "Numéro invalide.").default("") })
    .parse(await readJson(req));
  const category = /probl|erreur/i.test(input.subject) ? "probleme" : /suggestion|amélioration/i.test(input.subject) ? "suggestion" : "assistance";
  const { error } = await adminClient().from("support_tickets").insert({
    user_id: profile.id,
    email: profile.email,
    name: profile.full_name || profile.company_name || "",
    category,
    subject: input.subject,
    message: input.phone ? `${input.message}\n\nTéléphone : ${input.phone}` : input.message,
  });
  if (error) throw new HttpError(500, "Envoi impossible. Réessayez dans un instant.");
  return NextResponse.json({ ok: true });
});
