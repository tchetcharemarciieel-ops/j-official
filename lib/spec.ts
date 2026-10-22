import { z } from "zod";

/**
 * AppSpec : description complète d'un mini-logiciel.
 * Le générateur (IA ou règles) produit une AppSpec, jamais du code exécutable.
 * Le moteur d'exécution (components/runtime) l'interprète avec des composants validés.
 */

export const ROLES = ["owner", "admin", "manager", "employee", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  manager: "Gestionnaire",
  employee: "Employé",
  viewer: "Lecteur",
};

export const FIELD_TYPES = [
  "text",
  "longtext",
  "number",
  "money",
  "date",
  "select",
  "boolean",
  "email",
  "phone",
  "relation",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texte",
  longtext: "Texte long",
  number: "Nombre",
  money: "Montant (FCFA)",
  date: "Date",
  select: "Liste de choix",
  boolean: "Oui / Non",
  email: "E-mail",
  phone: "Téléphone",
  relation: "Lien vers une autre table",
};

const key = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, "Identifiant invalide (minuscules, chiffres, _)");

export const fieldSchema = z.object({
  key,
  label: z.string().min(1).max(60),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(60)).max(30).optional(),
  relation: key.optional(),
  showInTable: z.boolean().default(true),
});
export type Field = z.infer<typeof fieldSchema>;

export const actionPermsSchema = z.object({
  read: z.boolean(),
  create: z.boolean(),
  update: z.boolean(),
  delete: z.boolean(),
  /** Champs visibles mais non modifiables pour ce rôle (ex. prix pour un employé). */
  readonlyFields: z.array(key).default([]),
});
export type ActionPerms = z.infer<typeof actionPermsSchema>;

export const entitySchema = z.object({
  key,
  label: z.string().min(1).max(60),
  labelPlural: z.string().min(1).max(60),
  icon: z.string().max(4).default("📋"),
  description: z.string().max(200).default(""),
  fields: z.array(fieldSchema).min(1).max(40),
  /** Surcharges de permissions par rôle ; à défaut, permissions par défaut du rôle. */
  permissions: z.partialRecord(z.enum(ROLES), actionPermsSchema).default({}),
});
export type Entity = z.infer<typeof entitySchema>;

export const WIDGET_TYPES = ["count", "sum", "monthly", "breakdown", "recent", "low_stock"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const widgetSchema = z.object({
  type: z.enum(WIDGET_TYPES),
  label: z.string().min(1).max(80),
  entity: key,
  /** Champ numérique (sum, monthly, low_stock) ou de regroupement (breakdown). */
  field: key.optional(),
  /** Champ date pour les statistiques mensuelles (défaut : date de création). */
  dateField: key.optional(),
  threshold: z.number().optional(),
});
export type Widget = z.infer<typeof widgetSchema>;

export const automationSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  trigger: z.object({ entity: key, event: z.enum(["created", "updated", "deleted"]) }),
  /** webhook : appelle une intégration vérifiée ; journal : trace dans l'historique. */
  action: z.object({
    type: z.enum(["webhook", "journal"]),
    integrationId: z.string().uuid().optional(),
  }),
  enabled: z.boolean().default(false),
});
export type Automation = z.infer<typeof automationSchema>;

/** Espace de travail 3D : postes du bureau virtuel, chacun relié à un module réel du logiciel. */
export const STATION_KINDS = ["stats_board", "cashier", "kitchen", "dining", "stock", "counter", "repair_bay", "vehicle", "desk", "reception", "meeting", "bed", "salon_chair", "classroom"] as const;
export type StationKind = (typeof STATION_KINDS)[number];
export const WORKSPACE_LAYOUTS = ["restaurant", "garage", "pharmacie", "boutique", "bureau", "services", "ecole", "hotel", "transport"] as const;
export type WorkspaceLayout = (typeof WORKSPACE_LAYOUTS)[number];

export const stationSchema = z.object({
  id: key,
  kind: z.enum(STATION_KINDS),
  label: z.string().trim().min(1).max(40),
  /** Module ouvert au clic : clé d'une table, ou « __dashboard » pour les statistiques. */
  target: z.string().regex(/^(__dashboard|[a-z][a-z0-9_]*)$/).max(40),
});
export type Station = z.infer<typeof stationSchema>;

export const workspaceSchema = z.object({
  enabled: z.boolean().default(true),
  layout: z.enum(WORKSPACE_LAYOUTS),
  /** Nom affiché sur le mur (vide : nom du logiciel). */
  title: z.string().trim().max(60).default(""),
  stations: z.array(stationSchema).max(12).default([]),
  /** Modules masqués dans l'espace 3D (ils restent disponibles dans le menu). */
  hiddenEntities: z.array(key).max(15).default([]),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const appSpecSchema = z.object({
  name: z.string().min(1).max(80),
  sector: z.string().min(1).max(60),
  description: z.string().max(400).default(""),
  theme: z
    .object({
      primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6d5dfc"),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#22d3ee"),
      logoText: z.string().max(4).default("MS"),
      logoUrl: z.string().url().optional(),
    })
    .default({ primary: "#6d5dfc", accent: "#22d3ee", logoText: "MS" }),
  welcome: z.string().max(300).default(""),
  entities: z.array(entitySchema).min(1).max(15),
  dashboard: z.array(widgetSchema).max(12).default([]),
  automations: z.array(automationSchema).max(20).default([]),
  features: z
    .object({
      csvExport: z.boolean().default(true),
      pdfExport: z.boolean().default(false),
      dataAssistant: z.boolean().default(true),
    })
    .default({ csvExport: true, pdfExport: false, dataAssistant: true }),
  /** Absent sur les logiciels créés avant l'espace 3D : un espace par défaut est alors calculé. */
  workspace: workspaceSchema.optional(),
});
export type AppSpec = z.infer<typeof appSpecSchema>;

export function parseSpec(input: unknown): { ok: true; spec: AppSpec } | { ok: false; errors: string[] } {
  const res = appSpecSchema.safeParse(input);
  if (res.success) return { ok: true, spec: res.data };
  return {
    ok: false,
    errors: res.error.issues.map((i) => `${i.path.join(".") || "racine"} : ${i.message}`),
  };
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function toKey(input: string): string {
  const k = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(k) ? k : `c_${k}`.slice(0, 40);
}
