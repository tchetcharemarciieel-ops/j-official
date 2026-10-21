import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/** Demande d'assistance d'un client connecté : visible par l'équipe MiniSoft RCA dans /admin. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connexion requise.");
  const input = z
    .object({ subject: z.string().trim().min(3, "Précisez le sujet.").max(120), message: z.string().trim().min(10, "Décrivez votre demande en quelques mots.").max(2000), phone: z.string().trim().max(30).regex(/^[+0-9 ().-]*$/, "Numéro invalide.").default("") })
    .parse(await readJson(req));
  const { data: p } = await adminClient().from("profiles").select("company_name,company_sector,company_phone").eq("id", profile.id).single();
  const { error } = await adminClient().from("leads").insert({
    name: profile.full_name || profile.email,
    company: p?.company_name ?? "",
    sector: p?.company_sector ?? "",
    phone: input.phone || p?.company_phone || "",
    email: profile.email,
    message: `[${input.subject}]\n${input.message}`,
    source: "assistance",
  });
  if (error) throw new HttpError(500, "Envoi impossible. Réessayez dans un instant.");
  return NextResponse.json({ ok: true });
});
