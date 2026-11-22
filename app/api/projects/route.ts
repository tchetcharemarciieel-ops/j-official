import { NextResponse } from "next/server";
import { projectLimit } from "@/lib/plans";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { composeSpec, diagnosisSchema } from "@/lib/generator";
import { getTemplate } from "@/lib/templates";
import { getSetting } from "@/lib/settings";
import { saveVersion, uniqueSlug } from "@/lib/projects";
import { audit } from "@/lib/audit";
import { shopSpec } from "@/lib/shop/spec";
import { bureauSpec } from "@/lib/bureau/spec";
import { AGENCY_TYPES, AGENCY_TYPE_IDS, CURRENCIES, defaultSettings as bureauDefaults, entityKey as bureauKey, type AgencyType } from "@/lib/bureau/model";
import { SHOP_TYPE_IDS, SHOP_TYPES, defaultSettings, entityKey, type ShopType } from "@/lib/shop/model";

const bureauInput = z.object({
  name: z.string().trim().min(2).max(80),
  agency_type: z.enum(AGENCY_TYPE_IDS as [string, ...string[]]),
  sector: z.string().trim().max(80).default(""),
  employees_count: z.coerce.number().int().min(1).max(100000).default(1),
  offices_count: z.coerce.number().int().min(1).max(1000).default(1),
  address: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(30).default(""),
  currency: z.enum(Object.keys(CURRENCIES) as [string, ...string[]]).default("XAF"),
  logo: z.string().max(380_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).nullish(),
});
const body = z.union([
  z.object({ bureau: bureauInput }),
  z.object({ shop: z.object({ name: z.string().trim().min(2).max(80), type: z.enum(SHOP_TYPE_IDS as [string, ...string[]]) }) }),
  z.object({ diagnosis: diagnosisSchema, problem: z.string().max(4000) }),
  z.object({ templateId: z.string().max(40), name: z.string().trim().min(2).max(80) }),
]);

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connexion requise.");
  const input = body.parse(await readJson(req));
  const db = adminClient();

  // Quota de projets selon la formule
  const [{ limit, planName }, { count }] = await Promise.all([
    projectLimit(profile.plan),
    db.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", profile.id),
  ]);
  // Nombre de logiciels selon la formule ; les administrateurs de la plateforme ne sont pas limités.
  if (!profile.is_admin && (count ?? 0) >= limit)
    throw new HttpError(402, `Votre formule ${planName} permet ${limit} logiciel${limit > 1 ? "s" : ""}. Passez à une formule supérieure (page Abonnement) pour en créer d'autres.`);

  let spec, problem, diagnosis, templateId: string | null = null, sector;
  const shopType = "shop" in input ? (input.shop.type as ShopType) : null;
  const bureau = "bureau" in input ? input.bureau : null;
  if ("bureau" in input) {
    spec = bureauSpec(input.bureau.name, input.bureau.agency_type as AgencyType, "#2563eb", input.bureau.sector || undefined);
    problem = "MiniSoft Bureau : gestion de bureau et d'agence.";
    diagnosis = null;
    sector = AGENCY_TYPES[input.bureau.agency_type as AgencyType].label;
  } else if ("shop" in input) {
    spec = shopSpec(input.shop.name, shopType!);
    problem = "MiniSoft Shop : gestion complète de boutique (caisse, stock, boutique en ligne).";
    diagnosis = null;
    sector = SHOP_TYPES[shopType!].label;
  } else if ("diagnosis" in input) {
    if (!input.diagnosis.features.some((f) => f.selected)) throw new HttpError(400, "Sélectionnez au moins une fonctionnalité.");
    spec = composeSpec(input.diagnosis);
    problem = input.problem;
    diagnosis = input.diagnosis;
    sector = input.diagnosis.sectorLabel;
  } else {
    const tpl = getTemplate(input.templateId);
    if (!tpl || (await getSetting("templates")).disabled.includes(tpl.id)) throw new HttpError(404, "Modèle introuvable ou désactivé.");
    spec = { ...tpl.build(), name: input.name };
    problem = tpl.problems.join(" ");
    diagnosis = null;
    templateId = tpl.id;
    sector = tpl.category;
  }

  const slug = await uniqueSlug(spec.name);
  const { data: project, error } = await db
    .from("projects")
    .insert({ owner_id: profile.id, name: spec.name, slug, sector, problem, diagnosis, status: "generation", template_id: templateId })
    .select("id,draft_spec,draft_version")
    .single();
  if (error || !project) throw new HttpError(500, "Création du projet impossible.");
  await db.from("project_members").insert({ project_id: project.id, user_id: profile.id, role: "owner" });
  await audit("project.created", { projectId: project.id, actorId: profile.id, details: { templateId, slug, ...(shopType ? { module: "shop", type: shopType } : {}) } });
  if (bureau) {
    // Réglages de départ (configuration saisie par le client), pour les données réelles et de test.
    for (const demo of [false, true]) {
      let logoId: string | null = null;
      if (bureau.logo) {
        const { data: f } = await db.from("records").insert({ project_id: project.id, entity: bureauKey("file"), data: { name: "logo", mime: bureau.logo.slice(5, bureau.logo.indexOf(";")), size: Math.floor((bureau.logo.length * 3) / 4), data: bureau.logo.slice(bureau.logo.indexOf(",") + 1) }, is_demo: demo, created_by: profile.id, updated_by: profile.id }).select("id").single();
        logoId = f?.id ?? null;
      }
      const base = { ...bureauDefaults(bureau.name, bureau.agency_type as AgencyType), sector: bureau.sector || AGENCY_TYPES[bureau.agency_type as AgencyType].sector, employees_count: bureau.employees_count, offices_count: bureau.offices_count, address: bureau.address, phone: bureau.phone, currency: bureau.currency, logo_id: logoId };
      await db.from("records").insert({ project_id: project.id, entity: bureauKey("settings"), data: base, is_demo: demo, created_by: profile.id, updated_by: profile.id });
    }
  }
  if (shopType) {
    // Réglages de départ de la boutique, pour les données réelles et pour les données de test.
    const base = defaultSettings(spec.name, shopType);
    await db.from("records").insert([false, true].map((demo) => ({ project_id: project.id, entity: entityKey("settings"), data: base, is_demo: demo, created_by: profile.id, updated_by: profile.id })));
  }
  const saved = await saveVersion(project, spec, { summary: templateId ? "Création à partir d'un modèle" : "Première génération", source: templateId ? "template" : "generation", authorId: profile.id });
  return NextResponse.json({ id: project.id, version: saved.version, checks: saved.checks });
});
