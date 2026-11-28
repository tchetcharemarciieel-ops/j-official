import type { AppSpec, Entity } from "./spec";
import type { Row } from "./stats";

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const ymOf = (iso: string) => iso.slice(0, 7);
const ymAdd = (d: Date, delta: number) => {
  const x = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
};
const rowMonth = (r: Row, dateField?: string) => {
  const v = dateField ? r.data[dateField] : undefined;
  return typeof v === "string" && v.length >= 7 ? v.slice(0, 7) : ymOf(r.created_at);
};

/**
 * Évolution réelle d'un indicateur : ce mois-ci contre le mois précédent, calculée sur les fiches (par la date choisie,
 * sinon la date de création). Le pourcentage n'existe que s'il y a une base de comparaison : rien n'est inventé.
 */
export function monthTrend(rows: Row[], opts: { field?: string; dateField?: string } = {}, now = new Date()) {
  const cur = ymAdd(now, 0), prev = ymAdd(now, -1);
  const val = (r: Row) => (opts.field ? num(r.data[opts.field]) : 1);
  const current = rows.filter((r) => rowMonth(r, opts.dateField) === cur).reduce((a, r) => a + val(r), 0);
  const previous = rows.filter((r) => rowMonth(r, opts.dateField) === prev).reduce((a, r) => a + val(r), 0);
  return { current, previous, pct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null };
}

export type Activity = { id: string; entity: string; entityLabel: string; icon: string; title: string; at: string };
const titleOf = (e: Entity, r: Row) => {
  const f = e.fields.find((x) => x.type === "text") ?? e.fields[0];
  const v = f ? r.data[f.key] : undefined;
  return v === undefined || v === null || v === "" ? e.label : String(v);
};

/** Dernières fiches enregistrées, tous modules confondus (les plus récentes d'abord). */
export function recentActivity(spec: AppSpec, records: Record<string, Row[]>, limit = 8): Activity[] {
  const all: Activity[] = [];
  for (const e of spec.entities) for (const r of records[e.key] ?? []) all.push({ id: r.id, entity: e.key, entityLabel: e.label, icon: e.icon, title: titleOf(e, r), at: r.created_at });
  return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Recherche dans toutes les fiches lisibles : titre et valeurs texte, sans accent ni casse. */
export function globalSearch(spec: AppSpec, records: Record<string, Row[]>, query: string, readable: string[], limit = 8) {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const out: { id: string; entity: string; entityLabel: string; icon: string; title: string; detail: string }[] = [];
  for (const e of spec.entities) {
    if (!readable.includes(e.key)) continue;
    for (const r of records[e.key] ?? []) {
      const hay = e.fields.filter((f) => ["text", "longtext", "email", "phone", "select"].includes(f.type)).map((f) => String(r.data[f.key] ?? ""));
      if (hay.some((h) => norm(h).includes(q))) out.push({ id: r.id, entity: e.key, entityLabel: e.labelPlural, icon: e.icon, title: titleOf(e, r), detail: hay.filter((h) => h && h !== titleOf(e, r)).slice(0, 2).join(" · ") });
      if (out.length >= limit * 3) break;
    }
  }
  return out.slice(0, limit);
}

export function ago(iso: string, now = new Date()): string {
  const m = Math.round((now.getTime() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m) || m < 0) return "à l'instant";
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `il y a ${d} j` : new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
