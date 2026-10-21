import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { MODULES } from "./modules";
import { SECTORS, diagnosisSchema, type DiagnoseInput, type Diagnosis } from "./generator";
import { FIELD_TYPES, ROLES, WIDGET_TYPES, appSpecSchema, toKey, type AppSpec, type Entity } from "./spec";

/**
 * Intégration IA côté serveur uniquement : la clé n'est jamais envoyée au navigateur.
 * Le modèle ne produit que des données structurées (AppSpec), jamais du code exécuté.
 */

const MODEL = process.env.AI_MODEL || "claude-opus-5-5";
// Prix publics Anthropic pour claude-opus-5-5, en USD par million de jetons.
const PRICE_IN = 4;
const PRICE_OUT = 20;
const USD_TO_XAF = Number(process.env.USD_TO_XAF || 600);

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 });
  return client;
}

export type AiUsage = { inputTokens: number; outputTokens: number; costXaf: number; model: string };

export class AiError extends Error {
  constructor(
    message: string,
    public readonly usage?: AiUsage,
  ) {
    super(message);
  }
}

// ---------- Schémas simplifiés pour les sorties structurées ----------
const aiField = z.object({
  key: z.string().describe("identifiant en minuscules sans accents, ex: telephone"),
  label: z.string(),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  options: z.array(z.string()).describe("choix pour le type select, sinon liste vide"),
  relation: z.string().describe("clé de la table liée pour le type relation, sinon chaîne vide"),
  showInTable: z.boolean(),
});
const aiPerm = z.object({
  role: z.enum(ROLES),
  read: z.boolean(),
  create: z.boolean(),
  update: z.boolean(),
  delete: z.boolean(),
  readonlyFields: z.array(z.string()),
});
const aiEntity = z.object({
  key: z.string(),
  label: z.string(),
  labelPlural: z.string(),
  icon: z.string().describe("un seul emoji"),
  description: z.string(),
  fields: z.array(aiField),
  permissions: z.array(aiPerm).describe("uniquement les rôles dont les droits diffèrent des valeurs par défaut"),
});
const aiWidget = z.object({
  type: z.enum(WIDGET_TYPES),
  label: z.string(),
  entity: z.string(),
  field: z.string().describe("chaîne vide si non applicable"),
  dateField: z.string().describe("chaîne vide si non applicable"),
  threshold: z.number(),
});
const aiSpec = z.object({
  name: z.string(),
  sector: z.string(),
  description: z.string(),
  theme: z.object({ primary: z.string().describe("#rrggbb"), accent: z.string().describe("#rrggbb"), logoText: z.string().describe("2 lettres") }),
  welcome: z.string(),
  entities: z.array(aiEntity),
  dashboard: z.array(aiWidget),
  features: z.object({ csvExport: z.boolean(), pdfExport: z.boolean(), dataAssistant: z.boolean() }),
});
type AiSpec = z.infer<typeof aiSpec>;

function fromAiEntity(e: z.infer<typeof aiEntity>): Entity {
  return {
    key: toKey(e.key || e.label),
    label: e.label.slice(0, 60),
    labelPlural: (e.labelPlural || e.label).slice(0, 60),
    icon: [...(e.icon || "📋")].slice(0, 2).join(""),
    description: e.description.slice(0, 200),
    fields: e.fields.slice(0, 40).map((f) => ({
      key: toKey(f.key || f.label),
      label: f.label.slice(0, 60),
      type: f.type,
      required: f.required,
      options: f.type === "select" ? f.options.slice(0, 30).map((o) => o.slice(0, 60)) : undefined,
      relation: f.type === "relation" && f.relation ? toKey(f.relation) : undefined,
      showInTable: f.showInTable,
    })),
    permissions: Object.fromEntries(
      e.permissions.filter((p) => p.role !== "owner").map((p) => [p.role, { read: p.read, create: p.create, update: p.update, delete: p.delete, readonlyFields: p.readonlyFields.map(toKey) }]),
    ),
  };
}

function toAiSpec(spec: AppSpec): AiSpec {
  return {
    name: spec.name,
    sector: spec.sector,
    description: spec.description,
    theme: { primary: spec.theme.primary, accent: spec.theme.accent, logoText: spec.theme.logoText },
    welcome: spec.welcome,
    entities: spec.entities.map((e) => ({
      key: e.key,
      label: e.label,
      labelPlural: e.labelPlural,
      icon: e.icon,
      description: e.description,
      fields: e.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, options: f.options ?? [], relation: f.relation ?? "", showInTable: f.showInTable })),
      permissions: Object.entries(e.permissions).map(([role, p]) => ({ role: role as (typeof ROLES)[number], ...p! })),
    })),
    dashboard: spec.dashboard.map((w) => ({ type: w.type, label: w.label, entity: w.entity, field: w.field ?? "", dateField: w.dateField ?? "", threshold: w.threshold ?? 0 })),
    features: spec.features,
  };
}

function fromAiSpec(a: AiSpec, base?: AppSpec): AppSpec {
  const hex = (v: string, d: string) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
  return appSpecSchema.parse({
    name: a.name.slice(0, 80),
    sector: a.sector.slice(0, 60) || "Entreprise",
    description: a.description.slice(0, 400),
    theme: { primary: hex(a.theme.primary, "#6d5dfc"), accent: hex(a.theme.accent, "#22d3ee"), logoText: a.theme.logoText.slice(0, 4) || "MS", logoUrl: base?.theme.logoUrl },
    welcome: a.welcome.slice(0, 300),
    entities: a.entities.slice(0, 15).map(fromAiEntity),
    dashboard: a.dashboard.slice(0, 12).map((w) => ({
      type: w.type,
      label: w.label.slice(0, 80),
      entity: toKey(w.entity),
      field: w.field ? toKey(w.field) : undefined,
      dateField: w.dateField ? toKey(w.dateField) : undefined,
      threshold: w.type === "low_stock" ? w.threshold || 5 : undefined,
    })),
    automations: base?.automations ?? [],
    features: a.features,
  });
}

export type ImageInput = { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };

async function call<T extends z.ZodType>(system: string, user: string, schema: T, maxTokens = 16000, image?: ImageInput): Promise<{ data: z.infer<T>; usage: AiUsage }> {
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [
      {
        role: "user",
        content: image
          ? [
              { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
              { type: "text", text: user },
            ]
          : user,
      },
    ],
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
  });
  const inputTokens = res.usage.input_tokens;
  const outputTokens = res.usage.output_tokens;
  const usage: AiUsage = {
    inputTokens,
    outputTokens,
    model: res.model,
    costXaf: Math.round(((inputTokens * PRICE_IN + outputTokens * PRICE_OUT) / 1_000_000) * USD_TO_XAF),
  };
  if (res.stop_reason === "refusal") throw new AiError("La demande a été refusée par le modèle IA.", usage);
  if (res.stop_reason === "max_tokens") throw new AiError("La réponse de l'IA a été tronquée. Simplifiez la demande.", usage);
  if (!res.parsed_output) throw new AiError("Réponse IA illisible.", usage);
  return { data: res.parsed_output as z.infer<T>, usage };
}

const CONTEXT = `Tu es l'architecte logiciel de MiniSoft RCA, une plateforme qui crée des mini-logiciels de gestion pour les entreprises d'Afrique centrale (montants en FCFA XAF).
Tu ne produis jamais de code : uniquement une définition structurée interprétée par des composants validés (tables, formulaires, tableaux, tableaux de bord).
Types de champs disponibles : ${FIELD_TYPES.join(", ")}. Indicateurs : count (nombre de fiches), sum (somme d'un champ numérique/montant), monthly (total mensuel d'un champ, sur un champ date), breakdown (répartition par valeur d'un champ), recent (dernières fiches), low_stock (fiches dont le champ numérique est sous un seuil).
Rôles : owner (tous droits), admin, manager, employee (par défaut : lit/crée/modifie, ne supprime pas), viewer (lecture seule).
Modules de référence : ${MODULES.map((m) => `${m.id} (${m.title})`).join(", ")}.
Écris tout en français simple. Identifiants : minuscules, sans accents, underscore. N'invente pas de fonctionnalités impossibles (paiement en ligne, SMS, e-mail automatique) : signale-les dans les limites.`;

export async function aiDiagnose(input: DiagnoseInput, image?: ImageInput): Promise<{ diagnosis: Diagnosis; usage: AiUsage }> {
  const schema = z.object({
    businessName: z.string(),
    sector: z.enum(Object.keys(SECTORS) as [string, ...string[]]),
    sectorLabel: z.string(),
    mainProblem: z.string(),
    manualTasks: z.array(z.string()),
    dataToKeep: z.array(z.string()),
    users: z.string(),
    automations: z.array(z.string()),
    limits: z.array(z.string()),
    questions: z.array(z.string()).describe("0 à 3 questions courtes si la demande est imprécise, sinon liste vide"),
    features: z.array(z.object({ id: z.string(), title: z.string(), description: z.string(), selected: z.boolean(), entity: aiEntity, widgets: z.array(aiWidget) })),
  });
  const user = [
    `Problème décrit par le client : """${input.problem.slice(0, 4000)}"""`,
    input.businessName ? `Nom de l'entreprise : ${input.businessName}` : "",
    ...(input.answers ?? []).map((a) => `Question : ${a.question}\nRéponse : ${a.answer.slice(0, 1000)}`),
    image ? "Le client a joint une image (photo de cahier, formulaire, facture ou capture d'un ancien logiciel) : déduis-en les tables et champs utiles. N'en recopie pas les données personnelles." : "",
    input.csvColumns?.length ? `Colonnes d'un fichier joint par le client : ${input.csvColumns.map((c) => `${c.name} (${c.type})`).join(", ")}` : "",
    `Produis le diagnostic : problème principal, tâches manuelles à améliorer, données à conserver, utilisateurs, automatisations possibles, limites techniques, et 3 à 8 fonctionnalités (chacune = une table avec ses champs et ses indicateurs), adaptées précisément à CE client. Coche (selected=true) les fonctionnalités indispensables, propose les autres décochées.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const { data, usage } = await call(CONTEXT, user, schema, 16000, image);
  const diagnosis = diagnosisSchema.parse({
    source: "ai",
    businessName: data.businessName.slice(0, 80),
    sector: data.sector,
    sectorLabel: data.sectorLabel.slice(0, 60),
    mainProblem: data.mainProblem.slice(0, 400),
    manualTasks: data.manualTasks.slice(0, 10).map((s) => s.slice(0, 200)),
    dataToKeep: data.dataToKeep.slice(0, 15).map((s) => s.slice(0, 200)),
    users: data.users.slice(0, 200),
    automations: data.automations.slice(0, 10).map((s) => s.slice(0, 200)),
    limits: data.limits.slice(0, 10).map((s) => s.slice(0, 300)),
    questions: data.questions.slice(0, 3).map((s) => s.slice(0, 200)),
    features: data.features.slice(0, 15).map((f) => {
      const entity = fromAiEntity(f.entity);
      return {
        id: toKey(f.id || entity.key),
        title: f.title.slice(0, 80),
        description: f.description.slice(0, 240),
        selected: f.selected,
        entity,
        widgets: f.widgets.map((w) => ({
          type: w.type,
          label: w.label.slice(0, 80),
          entity: toKey(w.entity),
          field: w.field ? toKey(w.field) : undefined,
          dateField: w.dateField ? toKey(w.dateField) : undefined,
          threshold: w.type === "low_stock" ? w.threshold || 5 : undefined,
        })),
      };
    }),
  });
  return { diagnosis, usage };
}

export async function aiModify(spec: AppSpec, instruction: string): Promise<{ spec: AppSpec; summary: string; usage: AiUsage }> {
  const schema = z.object({
    understood: z.boolean().describe("false si la demande est impossible ou hors périmètre"),
    summary: z.string().describe("résumé en français des modifications, ou explication du refus"),
    spec: aiSpec,
  });
  const user = `Logiciel actuel (JSON) :\n${JSON.stringify(toAiSpec(spec))}\n\nDemande du propriétaire : """${instruction.slice(0, 2000)}"""\n\nRenvoie le logiciel complet modifié. Règles : modifie UNIQUEMENT ce qui est demandé ; conserve à l'identique les clés (key) des tables et champs existants pour préserver les données ; n'efface pas de table sans demande explicite ; un export PDF se fait par features.pdfExport ; une permission « consulter sans modifier les prix » se fait par readonlyFields sur le rôle employee.`;
  const { data, usage } = await call(CONTEXT, user, schema);
  if (!data.understood) throw new AiError(data.summary || "Demande non réalisable.", usage);
  return { spec: fromAiSpec(data.spec, spec), summary: data.summary.slice(0, 1000), usage };
}

export const queryPlanSchema = z.object({
  answerable: z.boolean(),
  reason: z.string().describe("si non réalisable : pourquoi (données manquantes…)"),
  entity: z.string(),
  operation: z.enum(["count", "sum", "average", "list"]),
  field: z.string().describe("champ numérique pour sum/average, sinon vide"),
  filters: z.array(z.object({ field: z.string(), op: z.enum(["eq", "neq", "lte", "gte", "contains"]), value: z.string() })),
  dateField: z.string().describe("champ date pour la période, ou 'created_at', ou vide"),
  period: z.enum(["all", "today", "this_week", "this_month", "last_month", "this_year"]),
});
export type QueryPlan = z.infer<typeof queryPlanSchema>;

/** L'IA traduit la question en requête ; le calcul est fait par le serveur, jamais par l'IA. */
export async function aiPlanQuery(spec: AppSpec, question: string): Promise<{ plan: QueryPlan; usage: AiUsage }> {
  const tables = spec.entities.map((e) => `${e.key} : ${e.fields.map((f) => `${f.key} (${f.type}${f.options ? ": " + f.options.join("/") : ""})`).join(", ")}`).join("\n");
  const { data, usage } = await call(
    "Tu traduis une question sur des données de gestion en requête structurée. Tu ne calcules rien et tu n'inventes aucun chiffre. Si la question ne peut pas être traitée avec les tables fournies, answerable=false.",
    `Tables disponibles :\n${tables}\n\nQuestion : """${question.slice(0, 500)}"""`,
    queryPlanSchema,
    4000,
  );
  return { plan: data, usage };
}
