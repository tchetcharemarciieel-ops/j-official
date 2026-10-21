import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

const optionalUrl = z.union([z.literal(""), z.string().url("Adresse du logo invalide.").startsWith("https://", "Le logo doit être une adresse https://").max(500)]);

const body = z.object({
  full_name: z.string().trim().max(80),
  company_name: z.string().trim().max(100),
  company_logo_url: optionalUrl,
  company_sector: z.string().trim().max(60),
  company_phone: z.string().trim().max(30).regex(/^[+0-9 ().-]*$/, "Numéro de téléphone invalide."),
  company_email: z.union([z.literal(""), z.string().trim().toLowerCase().email("E-mail de l'entreprise invalide.").max(200)]),
  company_address: z.string().trim().max(200),
});

/** Profil du compte et de l'entreprise : chacun ne modifie que le sien. */
export const PATCH = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connexion requise.");
  const input = body.parse(await readJson(req));
  const { error } = await adminClient().from("profiles").update(input).eq("id", profile.id);
  if (error) throw new HttpError(500, "Enregistrement impossible. Réessayez.");
  await audit("account.profile_updated", { actorId: profile.id });
  return NextResponse.json({ ok: true });
});
