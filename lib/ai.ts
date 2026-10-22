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

type ProviderName = "openai" | "anthropic" | "gemini";
const PROVIDERS: ProviderName[] = ["openai", "anthropic", "gemini"];
const KEY_VARS: Record<ProviderName, string> = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY" };

/** Modèle et prix par défaut de chaque fournisseur (USD par million de jetons). */
const DEFAULTS: Record<ProviderName, { model: string; priceIn: number; priceOut: number; label: string }> = {
  openai: { model: "gpt-5-mini", priceIn: 0.25, priceOut: 2, label: "OpenAI" },
  anthropic: { model: "claude-opus-5-5", priceIn: 4, priceOut: 20, label: "Anthropic" },
  gemini: { model: "gemini-3.8-flash", priceIn: 0.3, priceOut: 2.5, label: "Google Gemini" },
};
const USD_TO_XAF = Number(process.env.USD_TO_XAF || 600);
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 110_000);

export type AiConfig = { provider: ProviderName; label: string; model: string; priceIn: number; priceOut: number };

/**
 * Fournisseur choisi par variables d'environnement serveur :
 * AI_PROVIDER = openai | anthropic | gemini (sinon : celui dont la clé est présente),
 * OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY, AI_MODEL facultatif.
 */
export function aiConfig(): AiConfig | null {
  const wanted = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  const keyOf = (p: ProviderName) => process.env[KEY_VARS[p]]?.trim();
  let provider: ProviderName | null = null;
  if ((PROVIDERS as string[]).includes(wanted)) provider = keyOf(wanted as ProviderName) ? (wanted as ProviderName) : null;
  else if (!wanted) provider = PROVIDERS.find((p) => keyOf(p)) ?? null;
  if (!provider) return null;
  const d = DEFAULTS[provider];
  const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);
  return {
    provider,
    label: d.label,
    model: process.env.AI_MODEL?.trim() || d.model,
    priceIn: num(process.env.AI_PRICE_INPUT_USD, d.priceIn),
    priceOut: num(process.env.AI_PRICE_OUTPUT_USD, d.priceOut),
  };
}

export function aiAvailable(): boolean {
  return aiConfig() !== null;
}

let client: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: 1 });
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

function usageOf(cfg: AiConfig, model: string, inputTokens: number, outputTokens: number): AiUsage {
  return { inputTokens, outputTokens, model, costXaf: Math.round(((inputTokens * cfg.priceIn + outputTokens * cfg.priceOut) / 1_000_000) * USD_TO_XAF) };
}

async function call<T extends z.ZodType>(system: string, user: string, schema: T, maxTokens = 16000, image?: ImageInput): Promise<{ data: z.infer<T>; usage: AiUsage }> {
  const cfg = aiConfig();
  if (!cfg) throw new AiError("Aucun fournisseur IA n'est configuré sur le serveur.");
  if (cfg.provider === "openai") return callOpenAi(cfg, system, user, schema, maxTokens, image);
  if (cfg.provider === "gemini") return callGemini(cfg, system, user, schema, maxTokens, image);
  return callAnthropic(cfg, system, user, schema, maxTokens, image);
}

/** Une seconde tentative si le fournisseur est momentanément surchargé (erreurs 500, 502, 503, 504). */
async function fetchRetry(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (![500, 502, 503, 504].includes(res.status)) return res;
  await new Promise((r) => setTimeout(r, 2000));
  return fetch(url, init);
}

/** Appel à l'API Google Gemini (generateContent) avec sortie JSON imposée par un schéma. */
async function callGemini<T extends z.ZodType>(cfg: AiConfig, system: string, user: string, schema: T, maxTokens: number, image?: ImageInput): Promise<{ data: z.infer<T>; usage: AiUsage }> {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  const base = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetchRetry(`${base}/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: "POST",
      // Clé transmise en en-tête (jamais dans l'URL, qui peut apparaître dans des journaux).
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [...(image ? [{ inlineData: { mimeType: image.mediaType, data: image.data } }] : []), { text: user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          maxOutputTokens: maxTokens,
          // Réflexion courte par défaut sur Gemini 3 : réponses plus rapides et moins coûteuses.
          ...(/^gemini-3/.test(cfg.model) ? { thinkingConfig: { thinkingLevel: process.env.AI_REASONING_EFFORT || "low" } } : {}),
        },
      }),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new AiError(timeout ? "L'IA n'a pas répondu à temps." : "Impossible de joindre le fournisseur IA.");
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { status?: string; message?: string; details?: { reason?: string }[] } } | null;
    const invalidKey = detail?.error?.details?.some((d) => d.reason === "API_KEY_INVALID") || /api key not valid/i.test(detail?.error?.message ?? "");
    throw new AiError(providerErrorMessage(cfg, invalidKey ? 401 : res.status, detail?.error?.status === "RESOURCE_EXHAUSTED" ? "rate_limit" : undefined));
  }
  const json = (await res.json()) as {
    modelVersion?: string;
    promptFeedback?: { blockReason?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const u = json.usageMetadata;
  const usage = usageOf(cfg, json.modelVersion || cfg.model, u?.promptTokenCount ?? 0, (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0));
  const cand = json.candidates?.[0];
  if (json.promptFeedback?.blockReason || cand?.finishReason === "SAFETY" || cand?.finishReason === "PROHIBITED_CONTENT") throw new AiError("La demande a été refusée par le modèle IA.", usage);
  if (cand?.finishReason === "MAX_TOKENS") throw new AiError("La réponse de l'IA a été tronquée. Simplifiez la demande.", usage);
  const text = (cand?.content?.parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError("Réponse IA illisible.", usage);
  }
  const checked = schema.safeParse(parsed);
  if (!checked.success) throw new AiError("Réponse IA incomplète ou mal formée.", usage);
  return { data: checked.data as z.infer<T>, usage };
}

async function callAnthropic<T extends z.ZodType>(cfg: AiConfig, system: string, user: string, schema: T, maxTokens: number, image?: ImageInput): Promise<{ data: z.infer<T>; usage: AiUsage }> {
  let res;
  try {
    res = await getAnthropic().beta.messages.parse({
      model: cfg.model,
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
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    throw new AiError(providerErrorMessage(cfg, status));
  }
  const usage = usageOf(cfg, res.model, res.usage.input_tokens, res.usage.output_tokens);
  if (res.stop_reason === "refusal") throw new AiError("La demande a été refusée par le modèle IA.", usage);
  if (res.stop_reason === "max_tokens") throw new AiError("La réponse de l'IA a été tronquée. Simplifiez la demande.", usage);
  if (!res.parsed_output) throw new AiError("Réponse IA illisible.", usage);
  return { data: res.parsed_output as z.infer<T>, usage };
}

/** Appel à l'API OpenAI (Chat Completions) avec sortie JSON imposée par un schéma strict. */
async function callOpenAi<T extends z.ZodType>(cfg: AiConfig, system: string, user: string, schema: T, maxTokens: number, image?: ImageInput): Promise<{ data: z.infer<T>; usage: AiUsage }> {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  const reasoning = /^(gpt-5|o\d)/.test(cfg.model) ? { reasoning_effort: process.env.AI_REASONING_EFFORT || "low" } : {};
  let res: Response;
  try {
    res = await fetchRetry(`${(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: cfg.model,
        max_completion_tokens: maxTokens,
        ...reasoning,
        response_format: { type: "json_schema", json_schema: { name: "reponse", strict: true, schema: jsonSchema } },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: image
              ? [
                  { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } },
                  { type: "text", text: user },
                ]
              : user,
          },
        ],
      }),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new AiError(timeout ? "L'IA n'a pas répondu à temps." : "Impossible de joindre le fournisseur IA.");
  }
  if (!res.ok) {
    // Le corps d'erreur n'est jamais renvoyé tel quel au navigateur.
    const detail = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    throw new AiError(providerErrorMessage(cfg, res.status, detail?.error?.code));
  }
  const json = (await res.json()) as {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  };
  const usage = usageOf(cfg, json.model || cfg.model, json.usage?.prompt_tokens ?? 0, json.usage?.completion_tokens ?? 0);
  const choice = json.choices?.[0];
  if (choice?.message?.refusal) throw new AiError("La demande a été refusée par le modèle IA.", usage);
  if (choice?.finish_reason === "length") throw new AiError("La réponse de l'IA a été tronquée. Simplifiez la demande.", usage);
  let parsed: unknown;
  try {
    parsed = JSON.parse(choice?.message?.content ?? "");
  } catch {
    throw new AiError("Réponse IA illisible.", usage);
  }
  const checked = schema.safeParse(parsed);
  if (!checked.success) throw new AiError("Réponse IA incomplète ou mal formée.", usage);
  return { data: checked.data as z.infer<T>, usage };
}

function providerErrorMessage(cfg: AiConfig, status?: number, code?: string): string {
  if (status === 401 || status === 403) return `La clé API ${cfg.label} est refusée (invalide ou révoquée).`;
  if (status === 404) return `Le modèle « ${cfg.model} » est introuvable chez ${cfg.label}.`;
  if (status === 429) return code === "insufficient_quota" ? `Le compte ${cfg.label} n'a plus de crédit.` : `Le fournisseur ${cfg.label} limite temporairement les requêtes.`;
  if (status && status >= 500) return `Le fournisseur ${cfg.label} est temporairement indisponible.`;
  if (status === 400) return `Requête refusée par ${cfg.label} (paramètres du modèle).`;
  return `Erreur du fournisseur ${cfg.label}.`;
}

/** Petit appel réel servant à vérifier la configuration (page d'administration). */
export async function aiPing(): Promise<{ ok: true; usage: AiUsage; ms: number }> {
  const t0 = Date.now();
  const { data, usage } = await call("Réponds uniquement par le JSON demandé.", "Renvoie ok = true.", z.object({ ok: z.boolean() }), 2000);
  if (!data.ok) throw new AiError("Réponse inattendue du fournisseur IA.", usage);
  return { ok: true, usage, ms: Date.now() - t0 };
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
    causes: z.array(z.string()).describe("2 à 5 causes probables du problème, propres à ce client"),
    solutions: z.array(z.string()).describe("2 à 6 solutions concrètes que le mini-logiciel apporte, ou bonnes pratiques à adopter"),
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
    `Produis le diagnostic : problème principal, causes probables, solutions proposées, tâches manuelles à améliorer, données à conserver, utilisateurs, automatisations possibles, limites techniques, et 3 à 8 fonctionnalités (chacune = une table avec ses champs et ses indicateurs), adaptées précisément à CE client. Coche (selected=true) les fonctionnalités indispensables, propose les autres décochées.`,
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
    causes: data.causes.slice(0, 6).map((s) => s.slice(0, 300)),
    solutions: data.solutions.slice(0, 8).map((s) => s.slice(0, 300)),
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
