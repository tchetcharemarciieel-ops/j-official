import { z } from "zod";
import { MODULES, getModule } from "./modules";
import { appSpecSchema, entitySchema, widgetSchema, type AppSpec, type Entity, type Widget } from "./spec";
import { buildWorkspace } from "./workspace";

export const SECTORS: Record<string, { label: string; keywords: string[]; modules: string[]; color: string; icon: string }> = {
  restaurant: { label: "Restauration", keywords: ["restaurant", "maquis", "snack", "cafe", "bar", "traiteur", "cuisine", "plat"], modules: ["commandes", "produits", "depenses", "clients"], color: "#f97316", icon: "🍽️" },
  garage: { label: "Garage", keywords: ["garage", "mecani", "vehicule", "voiture", "moto", "reparation"], modules: ["reparations", "clients", "factures", "produits"], color: "#0ea5e9", icon: "🔧" },
  pharmacie: { label: "Pharmacie", keywords: ["pharmacie", "medicament", "officine"], modules: ["medicaments", "ventes", "fournisseurs"], color: "#10b981", icon: "💊" },
  boutique: { label: "Commerce", keywords: ["boutique", "magasin", "commerce", "vente", "supermarche", "quincaillerie", "stock"], modules: ["produits", "ventes", "clients", "fournisseurs"], color: "#8b5cf6", icon: "🛍️" },
  salon: { label: "Services", keywords: ["salon", "coiffure", "beaute", "esthetique", "barbier", "spa", "rendez"], modules: ["rendezvous", "clients", "ventes"], color: "#ec4899", icon: "💇" },
  ecole: { label: "École", keywords: ["ecole", "college", "lycee", "eleve", "scolar", "formation", "etudiant"], modules: ["eleves", "paiements", "employes"], color: "#f59e0b", icon: "🎓" },
  hotel: { label: "Hôtel", keywords: ["hotel", "auberge", "chambre", "residence", "sejour"], modules: ["chambres", "reservations", "clients", "depenses"], color: "#14b8a6", icon: "🏨" },
  immobilier: { label: "Immobilier", keywords: ["immobilier", "agence", "locataire", "loyer", "appartement", "bail"], modules: ["biens", "locataires", "paiements"], color: "#6366f1", icon: "🏠" },
  transport: { label: "Transport", keywords: ["transport", "livraison", "colis", "taxi", "logistique", "chauffeur"], modules: ["livraisons", "vehicules", "employes", "depenses"], color: "#ef4444", icon: "🚚" },
  interne: { label: "Gestion interne", keywords: ["personnel", "employe", "projet", "tache", "equipe", "pme"], modules: ["employes", "taches"], color: "#64748b", icon: "🗂️" },
};

export const featureSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(80),
  description: z.string().max(240).default(""),
  selected: z.boolean().default(true),
  entity: entitySchema.optional(),
  widgets: z.array(widgetSchema).optional(),
});
export type Feature = z.infer<typeof featureSchema>;

export const diagnosisSchema = z.object({
  source: z.enum(["ai", "rules"]),
  businessName: z.string().max(80).default(""),
  sector: z.string().max(40),
  sectorLabel: z.string().max(60),
  mainProblem: z.string().max(400),
  causes: z.array(z.string().max(300)).max(6).default([]),
  solutions: z.array(z.string().max(300)).max(8).default([]),
  manualTasks: z.array(z.string().max(200)).max(10).default([]),
  dataToKeep: z.array(z.string().max(200)).max(15).default([]),
  users: z.string().max(200).default(""),
  automations: z.array(z.string().max(200)).max(10).default([]),
  limits: z.array(z.string().max(300)).max(10).default([]),
  features: z.array(featureSchema).max(15),
  questions: z.array(z.string().max(200)).max(5).default([]),
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;

/** Réponse de POST /api/diagnose : indique toujours quel moteur a produit le résultat. */
export type DiagnoseResponse = {
  diagnosis: Diagnosis;
  engine: "ai" | "rules";
  /** Fournisseur et modèle ayant réellement répondu (uniquement si engine = "ai"). */
  /** fallback = true si le modèle principal avait atteint sa limite et qu'un modèle de secours a répondu. */
  provider: { name: string; model: string; fallback?: boolean } | null;
  /** Pourquoi le système de secours a été utilisé (null si l'IA a répondu). */
  fallbackReason: string | null;
  creditsUsed: number;
};

export type DiagnoseInput = {
  problem: string;
  answers?: { question: string; answer: string }[];
  businessName?: string;
  /** Colonnes détectées dans un fichier CSV joint (jamais les données elles-mêmes). */
  csvColumns?: { name: string; type: string }[];
};

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function detectSector(text: string): string | null {
  const t = normalize(text);
  let best: string | null = null;
  let bestScore = 0;
  for (const [id, s] of Object.entries(SECTORS)) {
    const score = s.keywords.reduce((acc, k) => acc + (t.includes(k) ? 1 : 0), 0);
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

/** Diagnostic par mots-clés : système de secours quand l'IA est absente, limitée ou en échec. */
export function diagnoseWithRules(input: DiagnoseInput): Diagnosis {
  const fullText = [input.problem, ...(input.answers ?? []).map((a) => a.answer)].join(" \n ");
  const t = normalize(fullText);
  const sectorId = detectSector(fullText);
  const sector = sectorId ? SECTORS[sectorId] : null;

  const matched = MODULES.filter((m) => m.keywords.some((k) => t.includes(k))).map((m) => m.id);
  const ids = Array.from(new Set([...(matched.length ? matched : []), ...(sector?.modules ?? [])])).slice(0, 7);

  const questions: string[] = [];
  const answered = new Set((input.answers ?? []).map((a) => a.question));
  const ask = (q: string) => !answered.has(q) && questions.push(q);
  if (!sector && matched.length === 0) {
    ask("Dans quel secteur travaillez-vous (restaurant, garage, boutique, école…) ?");
    ask("Quelles informations notez-vous aujourd'hui (sur cahier, Excel…) ?");
  }
  if (!input.businessName && !(input.answers ?? []).some((a) => /nom/i.test(a.question))) {
    ask("Quel est le nom de votre entreprise ?");
  }
  if (!(input.answers ?? []).some((a) => /personnes/i.test(a.question))) {
    ask("Combien de personnes utiliseront le logiciel, et ont-elles des rôles différents ?");
  }

  const features: Feature[] = (ids.length ? ids : ["clients", "taches"]).map((id) => {
    const m = getModule(id)!;
    return { id: m.id, title: m.title, description: m.description, selected: true };
  });
  // Modules supplémentaires proposés mais non cochés
  for (const id of ["employes", "depenses", "factures"]) {
    if (!features.some((f) => f.id === id)) {
      const m = getModule(id)!;
      features.push({ id: m.id, title: m.title, description: m.description, selected: false });
    }
  }

  if (input.csvColumns?.length) {
    const entity = entityFromColumns("import", "Données importées", input.csvColumns);
    features.unshift({
      id: "import",
      title: "Table issue de votre fichier",
      description: `Reprend les ${input.csvColumns.length} colonnes de votre fichier.`,
      selected: true,
      entity,
    });
  }

  const nameAnswer = (input.answers ?? []).find((a) => /nom/i.test(a.question))?.answer;
  const usersAnswer = (input.answers ?? []).find((a) => /personnes/i.test(a.question))?.answer;

  return {
    source: "rules",
    businessName: (input.businessName || nameAnswer || "").slice(0, 80),
    sector: sectorId ?? "interne",
    sectorLabel: sector?.label ?? "Gestion interne",
    mainProblem: input.problem.slice(0, 400),
    causes: [
      "Les informations sont notées à la main ou dispersées (cahiers, messages, fichiers).",
      "Aucun outil ne calcule automatiquement les totaux, les retards ou les alertes.",
    ],
    solutions: features.filter((f) => f.selected).map((f) => `${f.title} : ${f.description}`).slice(0, 8),
    manualTasks: features.filter((f) => f.selected).map((f) => `Saisie et suivi manuel : ${f.title.toLowerCase()}`).slice(0, 5),
    dataToKeep: features
      .filter((f) => f.selected)
      .map((f) => {
        const e = f.entity ?? getModule(f.id)?.entity;
        return e ? `${e.labelPlural} : ${e.fields.map((x) => x.label.toLowerCase()).join(", ")}` : f.title;
      }),
    users: usersAnswer ?? "Le propriétaire, puis les collaborateurs invités selon leur rôle.",
    automations: ["Alertes de stock bas ou de retard affichées sur le tableau de bord", "Notification (webhook) lors d'un nouvel enregistrement, si vous la configurez"],
    limits: [
      "Analyse réalisée par le système de secours (mots-clés) : elle repère votre secteur et vos besoins courants, sans comprendre le détail de votre situation.",
      "Les paiements en ligne et l'envoi de SMS ne sont pas inclus sans connecteur configuré.",
    ],
    features,
    questions: questions.slice(0, 3),
  };
}

export function entityFromColumns(key: string, label: string, columns: { name: string; type: string }[]): Entity {
  const used = new Set<string>();
  const fields = columns.slice(0, 40).map((c, i) => {
    let k = toFieldKey(c.name) || `colonne_${i + 1}`;
    while (used.has(k)) k = `${k}_${i}`.slice(0, 40);
    used.add(k);
    const type = (["number", "money", "date", "email", "phone", "boolean"].includes(c.type) ? c.type : "text") as Entity["fields"][number]["type"];
    return { key: k, label: c.name.slice(0, 60) || `Colonne ${i + 1}`, type, required: false, showInTable: i < 6 };
  });
  return { key, label, labelPlural: label, icon: "📥", description: "", fields, permissions: {} };
}

function toFieldKey(s: string): string {
  const k = normalize(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return /^[a-z]/.test(k) ? k : k ? `c_${k}`.slice(0, 40) : "";
}

/**
 * Compose une AppSpec à partir des fonctionnalités retenues.
 * Déterministe : même diagnostic → même logiciel. Les relations vers une table
 * absente sont converties en texte pour garder un logiciel cohérent.
 */
export function composeSpec(diagnosis: Diagnosis): AppSpec {
  const selected = diagnosis.features.filter((f) => f.selected);
  const entities: Entity[] = [];
  const widgets: Widget[] = [];
  for (const f of selected) {
    const mod = getModule(f.id);
    const entity = f.entity ?? mod?.entity;
    if (!entity || entities.some((e) => e.key === entity.key)) continue;
    entities.push(structuredClone(entity));
    widgets.push(...(f.widgets ?? mod?.widgets ?? []));
  }
  if (entities.length === 0) entities.push(structuredClone(getModule("taches")!.entity));

  const keys = new Set(entities.map((e) => e.key));
  for (const e of entities) {
    e.fields = e.fields.map((fl) => (fl.type === "relation" && (!fl.relation || !keys.has(fl.relation)) ? { ...fl, type: "text", relation: undefined } : fl));
  }
  const validWidgets = widgets.filter((w) => {
    const e = entities.find((x) => x.key === w.entity);
    return e && (!w.field || e.fields.some((fl) => fl.key === w.field)) && (!w.dateField || e.fields.some((fl) => fl.key === w.dateField));
  });
  if (validWidgets.length === 0) {
    for (const e of entities.slice(0, 3)) validWidgets.push({ type: "count", label: e.labelPlural, entity: e.key });
  }

  const sector = SECTORS[diagnosis.sector];
  const name = diagnosis.businessName || `Gestion ${sector?.label.toLowerCase() ?? "de mon activité"}`;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return appSpecSchema.parse({
    name,
    sector: diagnosis.sectorLabel,
    description: diagnosis.mainProblem.slice(0, 400),
    theme: { primary: sector?.color ?? "#6d5dfc", accent: "#22d3ee", logoText: initials || "MS" },
    welcome: `Bienvenue dans ${name}. Utilisez le menu pour gérer ${entities.map((e) => e.labelPlural.toLowerCase()).join(", ")}.`,
    entities,
    dashboard: validWidgets.slice(0, 12),
    automations: [],
    features: { csvExport: true, pdfExport: true, dataAssistant: true },
    // Bureau virtuel adapté au métier, chaque poste relié à un module du logiciel.
    workspace: buildWorkspace({ sector: `${diagnosis.sector} ${diagnosis.sectorLabel}`, entities }),
  });
}
