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
import { TRANSPORT_TYPES, TRANSPORT_TYPE_IDS, CURRENCIES as TR_CURRENCIES, defaultSettings as transportDefaults, entityKey as transportKey, type TransportType } from "@/lib/transport/model";
import { transportSpec } from "@/lib/transport/spec";
import { SCHOOL_TYPES, SCHOOL_TYPE_IDS, SYSTEM_IDS, CURRENCIES as EC_CURRENCIES, DEFAULT_LEVELS, defaultSettings as ecoleDefaults, entityKey as ecoleKey, defaultMentions, type SchoolType } from "@/lib/ecole/model";
import { ecoleSpec } from "@/lib/ecole/spec";
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
const transportInput = z.object({
  name: z.string().trim().min(2).max(80),
  transport_type: z.enum(TRANSPORT_TYPE_IDS as [string, ...string[]]),
  address: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(30).default(""),
  couriers_count: z.coerce.number().int().min(0).max(100000).default(1),
  vehicles_count: z.coerce.number().int().min(0).max(100000).default(1),
  zones: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  goods: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  currency: z.enum(Object.keys(TR_CURRENCIES) as [string, ...string[]]).default("XAF"),
  logo: z.string().max(380_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).nullish(),
});
const ecoleInput = z.object({
  name: z.string().trim().min(2).max(80),
  school_type: z.enum(SCHOOL_TYPE_IDS as [string, ...string[]]),
  system: z.enum(SYSTEM_IDS as [string, ...string[]]).default("francophone"),
  system_note: z.string().trim().max(200).default(""),
  students_count: z.coerce.number().int().min(0).max(100000).default(0),
  teachers_count: z.coerce.number().int().min(0).max(10000).default(0),
  classes_count: z.coerce.number().int().min(0).max(1000).default(0),
  terms: z.coerce.number().int().min(1).max(6).default(3),
  scale: z.coerce.number().min(1).max(1000).default(20),
  pass_mark: z.coerce.number().min(0).max(1000).default(10),
  year_start: z.coerce.number().int().min(2000).max(2100),
  levels: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  needs: z.string().trim().max(1000).default(""),
  address: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(30).default(""),
  currency: z.enum(Object.keys(EC_CURRENCIES) as [string, ...string[]]).default("XAF"),
  logo: z.string().max(380_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).nullish(),
});
const body = z.union([
  z.object({ ecole: ecoleInput }),
  z.object({ transport: transportInput }),
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
  const transport = "transport" in input ? input.transport : null;
  const ecole = "ecole" in input ? input.ecole : null;
  if ("ecole" in input) {
    spec = ecoleSpec(input.ecole.name, input.ecole.school_type as SchoolType);
    problem = "MiniSoft École : gestion scolaire (inscriptions, notes, bulletins, présences, finances, parents).";
    diagnosis = null;
    sector = SCHOOL_TYPES[input.ecole.school_type as SchoolType].label;
  } else if ("transport" in input) {
    spec = transportSpec(input.transport.name, input.transport.transport_type as TransportType);
    problem = "MiniSoft Transport & Delivery : gestion de transport et de livraison.";
    diagnosis = null;
    sector = TRANSPORT_TYPES[input.transport.transport_type as TransportType].label;
  } else if ("bureau" in input) {
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
  if (ecole) {
    // Configuration saisie à la création : paramètres de l'établissement, année scolaire en cours et niveaux.
    for (const demo of [false, true]) {
      let logoId: string | null = null;
      if (ecole.logo) {
        const { data: f } = await db.from("records").insert({ project_id: project.id, entity: ecoleKey("file"), data: { name: "logo", mime: ecole.logo.slice(5, ecole.logo.indexOf(";")), size: Math.floor((ecole.logo.length * 3) / 4), data: ecole.logo.slice(ecole.logo.indexOf(",") + 1) }, is_demo: demo, created_by: profile.id, updated_by: profile.id }).select("id").single();
        logoId = f?.id ?? null;
      }
      const d = ecoleDefaults(ecole.name, ecole.school_type as SchoolType);
      const termLabel = ecole.terms === 2 ? "Semestre" : ecole.terms === 3 ? "Trimestre" : "Période";
      const base = { ...d, system: ecole.system, system_note: ecole.system_note, students_count: ecole.students_count, teachers_count: ecole.teachers_count, classes_count: ecole.classes_count, terms: ecole.terms, term_label: termLabel, scale: ecole.scale, pass_mark: ecole.pass_mark, mentions: defaultMentions(ecole.scale, ecole.pass_mark), needs: ecole.needs, address: ecole.address, phone: ecole.phone, currency: ecole.currency, logo_id: logoId };
      const rows: { entity: string; data: object }[] = [
        { entity: ecoleKey("settings"), data: base },
        { entity: ecoleKey("year"), data: { name: `${ecole.year_start}-${ecole.year_start + 1}`, start: `${ecole.year_start}-09-01`, end: `${ecole.year_start + 1}-06-30`, current: true } },
        ...(ecole.levels.length ? ecole.levels : DEFAULT_LEVELS[ecole.school_type as SchoolType]).map((name, i) => ({ entity: ecoleKey("level"), data: { name, order: i + 1 } })),
      ];
      await db.from("records").insert(rows.map((r) => ({ project_id: project.id, entity: r.entity, data: r.data, is_demo: demo, created_by: profile.id, updated_by: profile.id })));
    }
  }
  if (transport) {
    for (const demo of [false, true]) {
      let logoId: string | null = null;
      if (transport.logo) {
        const { data: f } = await db.from("records").insert({ project_id: project.id, entity: transportKey("file"), data: { name: "logo", mime: transport.logo.slice(5, transport.logo.indexOf(";")), size: Math.floor((transport.logo.length * 3) / 4), data: transport.logo.slice(transport.logo.indexOf(",") + 1) }, is_demo: demo, created_by: profile.id, updated_by: profile.id }).select("id").single();
        logoId = f?.id ?? null;
      }
      const d = transportDefaults(transport.name, transport.transport_type as TransportType);
      const base = { ...d, address: transport.address, phone: transport.phone, couriers_count: transport.couriers_count, vehicles_count: transport.vehicles_count, currency: transport.currency, goods: transport.goods, logo_id: logoId, tariff: { ...d.tariff, zones: transport.zones.map((name) => ({ name, fee: 0 })), parcel_types: transport.goods.length ? transport.goods.map((name) => ({ name, mult: 1 })) : d.tariff.parcel_types } };
      await db.from("records").insert({ project_id: project.id, entity: transportKey("settings"), data: base, is_demo: demo, created_by: profile.id, updated_by: profile.id });
    }
  }
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
