import type { AppSpec, Widget } from "./spec";

/**
 * Tableau de bord complété automatiquement à partir de la structure RÉELLE du logiciel : un nombre de fiches par
 * module, le total de chaque montant, l'évolution mensuelle, la répartition par statut et les dernières fiches.
 * Tous ces indicateurs sont calculés sur les données saisies (aucun chiffre n'est inventé) ; ceux que le générateur
 * a déjà prévus sont conservés tels quels.
 */
export function dashboardFor(spec: AppSpec, min = 6, max = 12): Widget[] {
  const out: Widget[] = [...spec.dashboard];
  const has = (w: Partial<Widget>) => out.some((x) => x.type === w.type && x.entity === w.entity && (w.field === undefined || x.field === w.field));
  const push = (w: Widget) => { if (out.length < max && !has(w)) out.push(w); };
  // 1. Cartes de chiffres : un compteur par module, puis le total de chaque montant.
  for (const e of spec.entities) push({ type: "count", label: `${e.labelPlural} (nombre)`, entity: e.key });
  for (const e of spec.entities) {
    const money = e.fields.find((f) => f.type === "money");
    if (money) push({ type: "sum", label: `${e.labelPlural} : total ${money.label.toLowerCase()}`, entity: e.key, field: money.key });
  }
  // 2. Graphiques : évolution mensuelle des montants, répartition par statut ou catégorie.
  if (out.length < min || out.filter((w) => w.type === "monthly" || w.type === "breakdown").length < 2) {
    for (const e of spec.entities) {
      const money = e.fields.find((f) => f.type === "money");
      const date = e.fields.find((f) => f.type === "date");
      if (money && date) push({ type: "monthly", label: `${e.labelPlural} par mois`, entity: e.key, field: money.key, dateField: date.key });
    }
    for (const e of spec.entities) {
      const sel = e.fields.find((f) => f.type === "select" && f.options?.length);
      if (sel) push({ type: "breakdown", label: `${e.labelPlural} par ${sel.label.toLowerCase()}`, entity: e.key, field: sel.key });
    }
  }
  // 3. Dernières fiches du premier module.
  if (spec.entities[0] && !out.some((w) => w.type === "recent")) push({ type: "recent", label: `Dernier(e)s ${spec.entities[0].labelPlural.toLowerCase()}`, entity: spec.entities[0].key });
  return out;
}

/** Ordre d'affichage : cartes de chiffres d'abord, puis graphiques, puis listes. */
export function sortWidgets(ws: Widget[]): Widget[] {
  const rank = (w: Widget) => (w.type === "count" || w.type === "sum" ? 0 : w.type === "monthly" || w.type === "breakdown" ? 1 : 2);
  return [...ws].sort((a, b) => rank(a) - rank(b));
}
