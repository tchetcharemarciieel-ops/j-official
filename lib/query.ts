import { normalize } from "./generator";
import { formatValue } from "./records";
import type { AppSpec } from "./spec";
import type { Row } from "./stats";

export type Plan = {
  answerable: boolean;
  reason: string;
  entity: string;
  operation: "count" | "sum" | "average" | "list";
  field: string;
  filters: { field: string; op: "eq" | "neq" | "lte" | "gte" | "contains"; value: string }[];
  dateField: string;
  period: "all" | "today" | "this_week" | "this_month" | "last_month" | "this_year";
};

export type Answer = {
  answer: string;
  facts: string[];
  period: string;
  basis: string;
  missing: string[];
  rows?: { id: string; label: string }[];
};

const PERIOD_LABEL: Record<Plan["period"], string> = {
  all: "toutes les données",
  today: "aujourd'hui",
  this_week: "cette semaine (depuis lundi)",
  this_month: "ce mois-ci",
  last_month: "le mois dernier",
  this_year: "cette année",
};

function range(period: Plan["period"], now = new Date()): [Date, Date] | null {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case "all":
      return null;
    case "today":
      return [d, new Date(d.getTime() + 86400000)];
    case "this_week": {
      const day = (d.getDay() + 6) % 7;
      const start = new Date(d.getTime() - day * 86400000);
      return [start, new Date(start.getTime() + 7 * 86400000)];
    }
    case "this_month":
      return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 1)];
    case "last_month":
      return [new Date(d.getFullYear(), d.getMonth() - 1, 1), new Date(d.getFullYear(), d.getMonth(), 1)];
    case "this_year":
      return [new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear() + 1, 0, 1)];
  }
}

/** Planificateur par règles pour les questions courantes (sans IA). */
export function planWithRules(spec: AppSpec, question: string): Plan {
  const q = normalize(question);
  const base: Plan = { answerable: true, reason: "", entity: "", operation: "count", field: "", filters: [], dateField: "", period: "all" };
  if (/semaine/.test(q)) base.period = "this_week";
  else if (/aujourd/.test(q)) base.period = "today";
  else if (/mois dernier/.test(q)) base.period = "last_month";
  else if (/ce mois|du mois/.test(q)) base.period = "this_month";
  else if (/annee|an\b/.test(q)) base.period = "this_year";

  const entity =
    spec.entities.find((e) => [e.key, normalize(e.label), normalize(e.labelPlural)].some((n) => q.includes(n.replace(/s$/, "")))) ??
    (/vendu|vente|chiffre/.test(q) ? spec.entities.find((e) => /vente|commande/.test(e.key)) : undefined) ??
    (/epuis|stock/.test(q) ? spec.entities.find((e) => e.fields.some((f) => f.key === "quantite")) : undefined) ??
    (/payer|impaye|paye/.test(q) ? spec.entities.find((e) => e.fields.some((f) => f.type === "select" && f.options?.some((o) => /pay/i.test(o)))) : undefined) ??
    (/retard/.test(q) ? spec.entities.find((e) => e.fields.some((f) => f.key === "echeance")) : undefined);
  if (!entity) return { ...base, answerable: false, reason: "Je n'ai pas identifié la table concernée. Citez-la dans la question (ex. « commandes »)." };
  base.entity = entity.key;
  const date = entity.fields.find((f) => f.type === "date");
  base.dateField = date?.key ?? "created_at";

  if (/epuis|stock bas|rupture/.test(q)) {
    const qty = entity.fields.find((f) => f.key === "quantite") ?? entity.fields.find((f) => f.type === "number");
    if (!qty) return { ...base, answerable: false, reason: "Aucun champ de quantité dans cette table." };
    return { ...base, operation: "list", period: "all", filters: [{ field: qty.key, op: "lte", value: "5" }] };
  }
  if (/payer|impaye|doivent/.test(q)) {
    const statut = entity.fields.find((f) => f.type === "select" && f.options?.some((o) => /pay/i.test(o)));
    const paidOption = statut?.options?.find((o) => /^pay/i.test(o) && !/partiel|à payer|a payer/i.test(o));
    if (statut && paidOption) return { ...base, operation: "list", period: "all", filters: [{ field: statut.key, op: "neq", value: paidOption }] };
  }
  if (/retard/.test(q)) {
    const due = entity.fields.find((f) => f.key === "echeance") ?? date;
    const statut = entity.fields.find((f) => f.type === "select" && f.options?.some((o) => /termin/i.test(o)));
    if (!due) return { ...base, answerable: false, reason: "Aucune date d'échéance dans cette table." };
    const filters: Plan["filters"] = [{ field: due.key, op: "lte", value: new Date().toISOString().slice(0, 10) }];
    const done = statut?.options?.find((o) => /termin/i.test(o));
    if (statut && done) filters.push({ field: statut.key, op: "neq", value: done });
    return { ...base, operation: "list", period: "all", filters };
  }
  const money = entity.fields.find((f) => f.type === "money");
  if (/combien.*(vendu|gagne|encaisse|depense)|total|chiffre|montant|somme/.test(q) && money) return { ...base, operation: "sum", field: money.key };
  if (/moyen/.test(q) && money) return { ...base, operation: "average", field: money.key };
  return base;
}

/** Exécute un plan sur les données autorisées. Tous les chiffres viennent de ce calcul. */
export function executePlan(spec: AppSpec, plan: Plan, rows: Row[], now = new Date()): Answer {
  if (!plan.answerable) return { answer: plan.reason || "Je ne peux pas répondre avec les données disponibles.", facts: [], period: "", basis: "", missing: [plan.reason].filter(Boolean) };
  const entity = spec.entities.find((e) => e.key === plan.entity);
  if (!entity) return { answer: "Table inconnue.", facts: [], period: "", basis: "", missing: ["Table introuvable"] };
  const missing: string[] = [];
  const r = range(plan.period, now);
  let filtered = rows;
  if (r) {
    const df = plan.dateField && plan.dateField !== "created_at" ? plan.dateField : null;
    let noDate = 0;
    filtered = filtered.filter((row) => {
      const raw = df ? row.data[df] : row.created_at;
      if (!raw) {
        noDate++;
        return false;
      }
      const t = new Date(String(raw).length === 10 ? `${raw}T00:00:00` : String(raw)).getTime();
      return t >= r[0].getTime() && t < r[1].getTime();
    });
    if (noDate) missing.push(`${noDate} fiche(s) sans date ont été exclues.`);
  }
  for (const f of plan.filters) {
    const field = entity.fields.find((x) => x.key === f.field);
    if (!field) {
      missing.push(`Filtre ignoré : champ « ${f.field} » inexistant.`);
      continue;
    }
    filtered = filtered.filter((row) => {
      const v = row.data[f.field];
      const isNum = ["number", "money"].includes(field.type);
      const a = isNum ? Number(v ?? 0) : String(v ?? "").toLowerCase();
      const b = isNum ? Number(f.value) : f.value.toLowerCase();
      switch (f.op) {
        case "eq":
          return a === b;
        case "neq":
          return a !== b;
        case "lte":
          return a <= b;
        case "gte":
          return a >= b;
        case "contains":
          return String(a).includes(String(b));
      }
    });
  }
  const period = PERIOD_LABEL[plan.period];
  const filterText = plan.filters.map((f) => `${entity.fields.find((x) => x.key === f.field)?.label ?? f.field} ${{ eq: "=", neq: "≠", lte: "≤", gte: "≥", contains: "contient" }[f.op]} ${f.value}`).join(", ");
  const basis = `${filtered.length} fiche(s) de « ${entity.labelPlural} » sur ${rows.length}${filterText ? ` (filtre : ${filterText})` : ""}.`;
  const field = entity.fields.find((x) => x.key === plan.field);
  const title = entity.fields.find((f) => f.type === "text") ?? entity.fields[0]!;

  if ((plan.operation === "sum" || plan.operation === "average") && field) {
    const empty = filtered.filter((row) => row.data[field.key] === null || row.data[field.key] === undefined).length;
    if (empty) missing.push(`${empty} fiche(s) sans « ${field.label} » comptées pour 0.`);
    const total = filtered.reduce((a, row) => a + (Number(row.data[field.key]) || 0), 0);
    const value = plan.operation === "sum" ? total : filtered.length ? Math.round(total / filtered.length) : 0;
    const label = plan.operation === "sum" ? "Total" : "Moyenne";
    return { answer: `${label} « ${field.label} » — ${period} : ${formatValue(field, value)}.`, facts: [`${label} calculé(e) : ${formatValue(field, value)}`], period, basis, missing };
  }
  if (plan.operation === "list") {
    const list = filtered.slice(0, 20).map((row) => ({ id: row.id, label: String(row.data[title.key] ?? "—") }));
    return {
      answer: filtered.length ? `${filtered.length} fiche(s) correspondent : ${list.slice(0, 8).map((l) => l.label).join(", ")}${filtered.length > 8 ? "…" : ""}.` : "Aucune fiche ne correspond.",
      facts: [`${filtered.length} résultat(s)`],
      period,
      basis,
      missing,
      rows: list,
    };
  }
  return { answer: `${filtered.length} fiche(s) de « ${entity.labelPlural} » — ${period}.`, facts: [`Nombre : ${filtered.length}`], period, basis, missing };
}
