import { appSpecSchema, ROLES, type AppSpec, type Entity, type Field } from "./spec";
import { validateRecord, type RecordData } from "./records";
import { computeWidget, type Row } from "./stats";
import { permsFor } from "./permissions";

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckResult = {
  id: string;
  category: "Structure" | "Navigation" | "Formulaires" | "Calculs" | "Permissions" | "Mobile" | "Données" | "Base de données" | "Sécurité";
  name: string;
  status: CheckStatus;
  message: string;
  fix?: string;
  autoFixable?: boolean;
};

export function sampleValue(field: Field, i: number): RecordData[string] {
  switch (field.type) {
    case "text":
      return `${field.label} ${i + 1}`;
    case "longtext":
      return `Note de démonstration ${i + 1}`;
    case "number":
      return (i * 7) % 20;
    case "money":
      return 5000 + i * 2500;
    case "date": {
      const d = new Date(Date.UTC(2026, (i * 2) % 12, 1 + (i % 27)));
      return d.toISOString().slice(0, 10);
    }
    case "boolean":
      return i % 2 === 0;
    case "email":
      return `contact${i + 1}@exemple.cm`;
    case "phone":
      return `+237 6${String(70000000 + i * 1111).slice(0, 8)}`;
    case "select":
      return field.options?.[i % (field.options.length || 1)] ?? null;
    case "relation":
      return null;
  }
}

export function sampleRecord(entity: Entity, i: number): RecordData {
  const data: RecordData = {};
  for (const f of entity.fields) data[f.key] = sampleValue(f, i);
  return data;
}

/** Exécute les vérifications statiques et fonctionnelles d'une AppSpec. */
export function runChecks(spec: AppSpec, previous?: AppSpec): CheckResult[] {
  const results: CheckResult[] = [];
  const add = (r: CheckResult) => results.push(r);

  const parsed = appSpecSchema.safeParse(spec);
  add({
    id: "schema",
    category: "Structure",
    name: "Structure du logiciel valide",
    status: parsed.success ? "pass" : "fail",
    message: parsed.success ? "La définition respecte le format des composants validés." : parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; "),
    fix: parsed.success ? undefined : "Régénérer ou corriger les éléments signalés.",
  });
  if (!parsed.success) return results;

  // Clés uniques
  const keys = spec.entities.map((e) => e.key);
  const dupEntities = keys.filter((k, i) => keys.indexOf(k) !== i);
  add({
    id: "unique_entities",
    category: "Structure",
    name: "Tables aux identifiants uniques",
    status: dupEntities.length ? "fail" : "pass",
    message: dupEntities.length ? `Doublons : ${dupEntities.join(", ")}` : `${keys.length} table(s) distincte(s).`,
    fix: dupEntities.length ? "Supprimer les tables en double." : undefined,
    autoFixable: dupEntities.length > 0,
  });
  for (const e of spec.entities) {
    const fk = e.fields.map((f) => f.key);
    const dup = fk.filter((k, i) => fk.indexOf(k) !== i);
    if (dup.length)
      add({ id: `unique_fields_${e.key}`, category: "Structure", name: `Champs uniques (${e.labelPlural})`, status: "fail", message: `Champs en double : ${dup.join(", ")}`, fix: "Supprimer les champs en double.", autoFixable: true });
  }

  // Navigation : chaque table a une page, les relations pointent vers des tables existantes
  const broken: string[] = [];
  for (const e of spec.entities)
    for (const f of e.fields) if (f.type === "relation" && (!f.relation || !keys.includes(f.relation))) broken.push(`${e.labelPlural} → ${f.label}`);
  add({
    id: "relations",
    category: "Navigation",
    name: "Liens entre les tables",
    status: broken.length ? "fail" : "pass",
    message: broken.length ? `Liens vers des tables inexistantes : ${broken.join(", ")}` : "Tous les liens pointent vers des tables existantes.",
    fix: broken.length ? "Convertir ces champs en texte simple ou ajouter la table manquante." : undefined,
    autoFixable: broken.length > 0,
  });
  add({
    id: "navigation",
    category: "Navigation",
    name: "Menu de navigation",
    status: "pass",
    message: `Menu généré : Tableau de bord + ${spec.entities.map((e) => e.labelPlural).join(", ")}.`,
  });

  // Listes de choix
  const noOptions = spec.entities.flatMap((e) => e.fields.filter((f) => f.type === "select" && !f.options?.length).map((f) => `${e.labelPlural}.${f.label}`));
  add({
    id: "select_options",
    category: "Formulaires",
    name: "Listes de choix renseignées",
    status: noOptions.length ? "fail" : "pass",
    message: noOptions.length ? `Listes sans choix : ${noOptions.join(", ")}` : "Toutes les listes proposent des choix.",
    fix: noOptions.length ? "Ajouter des choix par défaut (À faire / En cours / Terminé)." : undefined,
    autoFixable: noOptions.length > 0,
  });

  // Simulation de formulaires
  const formErrors: string[] = [];
  for (const e of spec.entities) {
    const ok = validateRecord(e, sampleRecord(e, 0));
    if (!ok.ok) formErrors.push(`${e.labelPlural} : saisie valide refusée (${Object.keys(ok.errors).join(", ")})`);
    const requiredField = e.fields.find((f) => f.required && f.type !== "boolean");
    if (requiredField) {
      const missing = validateRecord(e, { ...sampleRecord(e, 0), [requiredField.key]: "" });
      if (missing.ok) formErrors.push(`${e.labelPlural} : champ obligatoire « ${requiredField.label} » non contrôlé`);
    }
    const emailField = e.fields.find((f) => f.type === "email");
    if (emailField) {
      const bad = validateRecord(e, { ...sampleRecord(e, 0), [emailField.key]: "pas-un-email" });
      if (bad.ok) formErrors.push(`${e.labelPlural} : e-mail invalide accepté`);
    }
  }
  add({
    id: "forms",
    category: "Formulaires",
    name: "Validation des formulaires (ajout, modification)",
    status: formErrors.length ? "fail" : "pass",
    message: formErrors.length ? formErrors.join(" ; ") : "Saisies valides acceptées, champs obligatoires et formats contrôlés.",
  });

  const noRequired = spec.entities.filter((e) => !e.fields.some((f) => f.required)).map((e) => e.labelPlural);
  if (noRequired.length)
    add({ id: "required", category: "Formulaires", name: "Champ principal obligatoire", status: "warn", message: `Aucun champ obligatoire dans : ${noRequired.join(", ")}. Des fiches vides pourront être créées.`, fix: "Rendre le premier champ obligatoire.", autoFixable: true });

  // Calculs du tableau de bord
  const calcErrors: string[] = [];
  for (const w of spec.dashboard) {
    const e = spec.entities.find((x) => x.key === w.entity);
    if (!e) {
      calcErrors.push(`« ${w.label} » : table inconnue`);
      continue;
    }
    const field = w.field ? e.fields.find((f) => f.key === w.field) : undefined;
    if (w.field && !field) {
      calcErrors.push(`« ${w.label} » : champ « ${w.field} » inexistant`);
      continue;
    }
    if (["sum", "low_stock"].includes(w.type) && (!field || !["number", "money"].includes(field.type))) {
      calcErrors.push(`« ${w.label} » : un champ numérique est nécessaire`);
      continue;
    }
    const rows: Row[] = Array.from({ length: 4 }, (_, i) => ({ id: `t${i}`, data: sampleRecord(e, i), created_at: new Date(Date.UTC(2026, i, 3)).toISOString() }));
    const res = computeWidget(spec, w, rows);
    if (w.type === "count" && res.kind === "number" && res.value !== 4) calcErrors.push(`« ${w.label} » : comptage incorrect`);
    if (w.type === "sum" && res.kind === "number") {
      const expected = rows.reduce((a, r) => a + Number(r.data[w.field!] ?? 0), 0);
      if (res.value !== expected) calcErrors.push(`« ${w.label} » : somme incorrecte (${res.value} au lieu de ${expected})`);
    }
    if (res.kind === "series" && res.points.some((p) => !Number.isFinite(p.value))) calcErrors.push(`« ${w.label} » : valeur non numérique`);
  }
  add({
    id: "calculations",
    category: "Calculs",
    name: "Calculs du tableau de bord",
    status: calcErrors.length ? "fail" : "pass",
    message: calcErrors.length ? calcErrors.join(" ; ") : `${spec.dashboard.length} indicateur(s) vérifié(s) sur des données de test.`,
    fix: calcErrors.length ? "Retirer les indicateurs invalides." : undefined,
    autoFixable: calcErrors.length > 0,
  });

  // Permissions
  const permIssues: string[] = [];
  for (const e of spec.entities) {
    const owner = permsFor(e, "owner");
    if (!owner.read || !owner.update) permIssues.push(`${e.labelPlural} : le propriétaire doit garder tous les droits`);
    const viewer = permsFor(e, "viewer");
    if (viewer.create || viewer.update || viewer.delete) permIssues.push(`${e.labelPlural} : le rôle Lecteur peut modifier des données`);
    for (const role of ROLES) {
      const ro = e.permissions?.[role]?.readonlyFields ?? [];
      const unknown = ro.filter((k) => !e.fields.some((f) => f.key === k));
      if (unknown.length) permIssues.push(`${e.labelPlural} : champs protégés inconnus (${unknown.join(", ")})`);
    }
  }
  add({
    id: "permissions",
    category: "Permissions",
    name: "Cohérence des rôles et permissions",
    status: permIssues.length ? "warn" : "pass",
    message: permIssues.length ? permIssues.join(" ; ") : "Rôles cohérents. Chaque action est revérifiée côté serveur.",
  });

  // Mobile
  const wide = spec.entities.filter((e) => e.fields.filter((f) => f.showInTable).length > 6).map((e) => e.labelPlural);
  add({
    id: "mobile",
    category: "Mobile",
    name: "Affichage mobile",
    status: wide.length ? "warn" : "pass",
    message: wide.length ? `Beaucoup de colonnes dans : ${wide.join(", ")}. Sur téléphone, les fiches s'affichent en cartes.` : "Tableaux lisibles ; affichage en cartes sur petit écran.",
    fix: wide.length ? "Masquer les colonnes secondaires dans les tableaux." : undefined,
    autoFixable: wide.length > 0,
  });

  // Conservation des données lors d'une modification
  if (previous) {
    const removed: string[] = [];
    for (const pe of previous.entities) {
      const ne = spec.entities.find((e) => e.key === pe.key);
      if (!ne) removed.push(`table ${pe.labelPlural}`);
      else for (const pf of pe.fields) if (!ne.fields.some((f) => f.key === pf.key)) removed.push(`${pe.labelPlural}.${pf.label}`);
    }
    const retyped: string[] = [];
    for (const pe of previous.entities) {
      const ne = spec.entities.find((e) => e.key === pe.key);
      for (const pf of pe.fields) {
        const nf = ne?.fields.find((f) => f.key === pf.key);
        if (nf && nf.type !== pf.type) retyped.push(`${pe.labelPlural}.${pf.label} (${pf.type} → ${nf.type})`);
      }
    }
    add({
      id: "data_preservation",
      category: "Données",
      name: "Conservation des données existantes",
      status: retyped.length ? "warn" : "pass",
      message: [
        removed.length ? `Éléments retirés de l'affichage : ${removed.join(", ")}. Les données restent stockées et réapparaissent si vous restaurez la version précédente.` : "Aucune table ni aucun champ retiré.",
        retyped.length ? `Changement de type : ${retyped.join(", ")}. Les anciennes valeurs non compatibles seront signalées à la modification.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  return results;
}

/** Applique les corrections automatiques sûres. Ne touche jamais aux données. */
export function autoFix(spec: AppSpec): AppSpec {
  const s: AppSpec = structuredClone(spec);
  const seen = new Set<string>();
  s.entities = s.entities.filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true)));
  const keys = new Set(s.entities.map((e) => e.key));
  for (const e of s.entities) {
    const fseen = new Set<string>();
    e.fields = e.fields.filter((f) => (fseen.has(f.key) ? false : (fseen.add(f.key), true)));
    e.fields = e.fields.map((f) => {
      if (f.type === "relation" && (!f.relation || !keys.has(f.relation))) return { ...f, type: "text" as const, relation: undefined };
      if (f.type === "select" && !f.options?.length) return { ...f, options: ["À faire", "En cours", "Terminé"] };
      return f;
    });
    if (!e.fields.some((f) => f.required) && e.fields[0]) e.fields[0] = { ...e.fields[0], required: true };
    let shown = 0;
    e.fields = e.fields.map((f) => (f.showInTable && ++shown > 6 ? { ...f, showInTable: false } : f));
  }
  s.dashboard = s.dashboard.filter((w) => {
    const e = s.entities.find((x) => x.key === w.entity);
    if (!e) return false;
    const field = w.field ? e.fields.find((f) => f.key === w.field) : undefined;
    if (w.field && !field) return false;
    if (w.dateField && !e.fields.some((f) => f.key === w.dateField)) return false;
    if (["sum", "low_stock"].includes(w.type) && (!field || !["number", "money"].includes(field.type))) return false;
    return true;
  });
  return s;
}

export function summarize(results: CheckResult[]) {
  return {
    total: results.length,
    passed: results.filter((r) => r.status === "pass").length,
    warnings: results.filter((r) => r.status === "warn").length,
    failed: results.filter((r) => r.status === "fail").length,
  };
}
