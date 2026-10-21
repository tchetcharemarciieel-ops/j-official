import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

const body = z
  .object({
    name: z.string().trim().min(2, "Indiquez votre nom.").max(80),
    company: z.string().trim().max(100).default(""),
    sector: z.string().trim().max(60).default(""),
    phone: z.string().trim().max(30).regex(/^[+0-9 ().-]*$/, "Numéro invalide.").default(""),
    email: z.string().trim().toLowerCase().max(200).default(""),
    message: z.string().trim().max(1500).default(""),
    source: z.string().trim().max(80).default(""),
    consent: z.literal(true, { message: "Acceptez d'être recontacté." }),
    website: z.string().max(0).optional(), // champ piège anti-robots
  })
  .refine((d) => d.phone.replace(/\D/g, "").length >= 8 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email), { message: "Indiquez un téléphone ou un e-mail valide.", path: ["phone"] });

const recent = new Map<string, number[]>();

/** Demande de démonstration : enregistrée pour l'équipe MiniSoft RCA, visible dans /admin. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
  hits.push(now);
  recent.set(ip, hits);
  if (hits.length > 5) throw new HttpError(429, "Trop de demandes depuis cet appareil. Réessayez plus tard.");
  const input = body.parse(await readJson(req));
  const { error } = await adminClient().from("leads").insert({
    name: input.name,
    company: input.company,
    sector: input.sector,
    phone: input.phone,
    email: input.email,
    message: input.message,
    source: input.source,
  });
  if (error) throw new HttpError(500, "Envoi impossible. Réessayez dans un instant.");
  await audit("lead.created", { details: { sector: input.sector, source: input.source } });
  return NextResponse.json({ ok: true });
});
