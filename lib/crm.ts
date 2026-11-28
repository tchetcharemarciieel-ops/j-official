import type { AppSpec, Entity, Field } from "./spec";
import type { Row } from "./stats";

const DAY = 86400000;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export type Stat = { id: string; label: string; value: number; unit?: string; hint?: string; tone: "blue" | "green" | "amber" | "red" | "slate" };

/** Champ de statut d'un module (« Statut », « État »…) ou, à défaut, la première liste de choix. */
export function statusField(e: Entity): Field | undefined {
  return e.fields.find((f) => f.type === "select" && /statut|status|etat|état/i.test(`${f.key} ${f.label}`) && f.options?.length) ?? e.fields.find((f) => f.type === "select" && f.options?.length);
}
/** Couleur d'un statut d'après son sens (actif/payé = vert, en attente = orange, inactif/annulé = rouge). */
export function statusTone(v: unknown): "green" | "amber" | "red" | "blue" | "slate" {
  const s = String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/inactif|annul|impay|echec|perdu|refus|rupture|bloque|suspend/.test(s)) return "red";
  if (/attente|prospect|brouillon|a payer|a faire|partiel|nouveau|pending|retard/.test(s)) return "amber";
  if (/actif|pay|termin|livre|servi|valide|fait|clos|regle|solde|disponible|confirm|present/.test(s)) return "green";
  return "slate";
}

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const titleKey = (e: Entity) => (e.fields.find((f) => f.type === "text") ?? e.fields[0])?.key ?? "";

/**
 * Modules liés à celui-ci : par un champ « relation » (lien exact), ou par un champ texte qui porte le nom du module
 * (ex. le champ « Client » d'anciens logiciels, rapproché par le nom de la fiche).
 */
export type Link = { entity: Entity; field: Field; by: "id" | "name" };
export function relatedFields(spec: AppSpec, entity: Entity): Link[] {
  return spec.entities.flatMap((o): Link[] => {
    if (o.key === entity.key) return [];
    return o.fields.flatMap((f): Link[] => (f.type === "relation" && f.relation === entity.key ? [{ entity: o, field: f, by: "id" }] : f.type === "text" && [norm(entity.label), norm(entity.key)].includes(norm(f.key)) ? [{ entity: o, field: f, by: "name" }] : []));
  });
}

/** Lien d'une fiche d'un autre module vers `target` ? (par identifiant ou par nom). */
function linksTo(link: Link, r: Row, target: { id: string; name: string }) {
  const v = r.data[link.field.key];
  return link.by === "id" ? v === target.id : target.name !== "" && norm(v) === target.name;
}

/**
 * Statistiques d'un module, toutes calculées sur les fiches : total, nouvelles fiches du mois, répartition par statut,
 * activité récente (fiches d'autres modules qui lui sont liées sur les 90 derniers jours) et total des montants.
 */
export function moduleStats(spec: AppSpec, entity: Entity, rows: Row[], records: Record<string, Row[]>, now = new Date()): Stat[] {
  const out: Stat[] = [{ id: "total", label: `Total des ${entity.labelPlural.toLowerCase()}`, value: rows.length, tone: "blue" }];
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const fresh = rows.filter((r) => r.created_at.slice(0, 7) === ym).length;
  out.push({ id: "new", label: "Nouveaux ce mois-ci", value: fresh, tone: "green", hint: fresh ? undefined : "aucun ce mois-ci" });
  // Actifs / inactifs : un statut explicite « Actif » / « Inactif » prime ; sinon l'activité liée sur 90 jours.
  const sf = statusField(entity);
  const opts = (sf?.options ?? []).map((o) => o.toLowerCase());
  if (sf && opts.includes("actif") && opts.includes("inactif")) {
    out.push({ id: "active", label: "Actifs", value: rows.filter((r) => String(r.data[sf.key]).toLowerCase() === "actif").length, tone: "green" });
    out.push({ id: "inactive", label: "Inactifs", value: rows.filter((r) => String(r.data[sf.key]).toLowerCase() === "inactif").length, tone: "slate" });
  } else {
    const rel = relatedFields(spec, entity);
    if (rel.length && rows.length) {
      const since = now.getTime() - 90 * DAY;
      const tk = titleKey(entity);
      const active = new Set<string>();
      for (const link of rel) for (const r of records[link.entity.key] ?? []) {
        if (Date.parse(r.created_at) < since) continue;
        for (const c of rows) if (linksTo(link, r, { id: c.id, name: norm(c.data[tk]) })) active.add(c.id);
      }
      const n = rows.filter((r) => active.has(r.id)).length;
      out.push({ id: "active", label: "Actifs (90 jours)", value: n, tone: "green", hint: "avec une activité récente" });
      out.push({ id: "inactive", label: "Sans activité", value: rows.length - n, tone: "slate", hint: "depuis plus de 90 jours" });
    } else if (sf) {
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(String(r.data[sf.key] ?? ""), (counts.get(String(r.data[sf.key] ?? "")) ?? 0) + 1);
      for (const [label, value] of [...counts.entries()].filter(([l]) => l).sort((a, b) => b[1] - a[1]).slice(0, 2)) out.push({ id: `s-${label}`, label, value, tone: statusTone(label) });
    }
  }
  const money = entity.fields.find((f) => f.type === "money");
  if (money && out.length < 5) out.push({ id: "money", label: `Total ${money.label.toLowerCase()}`, value: rows.reduce((a, r) => a + num(r.data[money.key]), 0), unit: "FCFA", tone: "amber" });
  return out.slice(0, 4);
}

export type Interaction = { id: string; entity: string; entityLabel: string; icon: string; title: string; detail: string; at: string };
/** Historique des interactions d'une fiche : toutes les fiches des autres modules qui la référencent, la plus récente d'abord. */
export function interactionsFor(spec: AppSpec, entity: Entity, recordId: string, records: Record<string, Row[]>, limit = 30): Interaction[] {
  const out: Interaction[] = [];
  const self = (records[entity.key] ?? []).find((r) => r.id === recordId);
  const target = { id: recordId, name: norm(self?.data[titleKey(entity)]) };
  for (const link of relatedFields(spec, entity)) {
    const o = link.entity;
    const title = o.fields.find((f) => f.type === "text") ?? o.fields[0];
    const money = o.fields.find((f) => f.type === "money");
    for (const r of records[o.key] ?? []) {
      if (!linksTo(link, r, target)) continue;
      out.push({ id: r.id, entity: o.key, entityLabel: o.label, icon: o.icon, title: String(r.data[title?.key ?? ""] ?? o.label) || o.label, detail: money && r.data[money.key] !== undefined && r.data[money.key] !== "" ? `${num(r.data[money.key]).toLocaleString("fr-FR")} FCFA` : "", at: r.created_at });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export const initials = (s: string) => s.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "•";
