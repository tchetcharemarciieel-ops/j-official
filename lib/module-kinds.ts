import type { Entity } from "./spec";
import type { Row } from "./stats";

/**
 * Savoir-faire propre à chaque type de module : statistiques utiles, filtres rapides (avec leur nombre), pastilles d'état,
 * totaux du bas de tableau. Tout est calculé sur les fiches saisies ; un module inconnu garde l'affichage générique.
 */
export type Tone = "green" | "amber" | "red" | "blue" | "slate";
export type KStat = { id: string; label: string; value: number; unit?: string; hint?: string; tone: "blue" | "green" | "amber" | "red" | "slate" };
export type Chip = { id: string; label: string; test: (r: Row, now: Date) => boolean };
export type Kind = {
  id: string;
  stats: (rows: Row[], now: Date) => KStat[];
  chips: Chip[];
  badge?: (r: Row, now: Date) => { label: string; tone: Tone } | null;
  footer?: (rows: Row[], fmt: (n: number) => string) => string;
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const day = (d: Date) => d.toISOString().slice(0, 10);
const when = (r: Row, key = "date") => (typeof r.data[key] === "string" && String(r.data[key]).length >= 10 ? String(r.data[key]).slice(0, 10) : r.created_at.slice(0, 10));
const ym = (d: Date) => day(d).slice(0, 7);
const is = (v: unknown, ...xs: string[]) => xs.includes(String(v ?? "").toLowerCase());
const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
const st = (id: string, label: string, value: number, tone: KStat["tone"], extra: Partial<KStat> = {}): KStat => ({ id, label, value, tone, ...extra });
const today = (key = "date"): Chip => ({ id: "today", label: "Aujourd'hui", test: (r, now) => when(r, key) === day(now) });
const month = (key = "date"): Chip => ({ id: "month", label: "Ce mois-ci", test: (r, now) => when(r, key).slice(0, 7) === ym(now) });
const FCFA = "FCFA";

const sales: Kind = {
  id: "sales",
  stats: (rows, now) => {
    const t = rows.filter((r) => when(r) === day(now)), m = rows.filter((r) => when(r).slice(0, 7) === ym(now));
    return [st("day", "Chiffre du jour", sum(t, (r) => n(r.data.montant)), "green", { unit: FCFA, hint: `${t.length} vente(s)` }), st("month", "Chiffre du mois", sum(m, (r) => n(r.data.montant)), "blue", { unit: FCFA, hint: `${m.length} vente(s)` }), st("avg", "Panier moyen (mois)", m.length ? Math.round(sum(m, (r) => n(r.data.montant)) / m.length) : 0, "amber", { unit: FCFA }), st("credit", "Ventes à crédit", rows.filter((r) => is(r.data.paiement, "crédit", "credit")).length, "red", { hint: "à encaisser" })];
  },
  chips: [today(), month(), { id: "credit", label: "À crédit", test: (r) => is(r.data.paiement, "crédit", "credit") }],
  footer: (rows, fmt) => (rows.length ? `${rows.length} vente(s) · Total ${fmt(sum(rows, (r) => n(r.data.montant)))} · Panier moyen ${fmt(Math.round(sum(rows, (r) => n(r.data.montant)) / rows.length))}` : ""),
};

const level = (r: Row) => { const q = n(r.data.quantite), low = r.data.seuil === undefined || r.data.seuil === "" ? 5 : n(r.data.seuil); return q <= 0 ? "out" : q <= low ? "low" : "ok"; };
const stock: Kind = {
  id: "stock",
  stats: (rows) => [st("n", "Produits référencés", rows.length, "blue"), st("value", "Valeur du stock", Math.round(sum(rows, (r) => n(r.data.quantite) * (n(r.data.prix_achat) || n(r.data.prix_vente)))), "green", { unit: FCFA, hint: "quantité × prix d'achat" }), st("low", "Stock bas", rows.filter((r) => level(r) === "low").length, "amber", { hint: "sous le seuil" }), st("out", "En rupture", rows.filter((r) => level(r) === "out").length, "red")],
  chips: [{ id: "low", label: "Stock bas", test: (r) => level(r) === "low" }, { id: "out", label: "Ruptures", test: (r) => level(r) === "out" }],
  badge: (r) => { const l = level(r); return l === "out" ? { label: "Rupture", tone: "red" } : l === "low" ? { label: "Stock bas", tone: "amber" } : { label: "En stock", tone: "green" }; },
  footer: (rows, fmt) => (rows.length ? `${rows.length} produit(s) · Valeur du stock ${fmt(Math.round(sum(rows, (r) => n(r.data.quantite) * (n(r.data.prix_achat) || n(r.data.prix_vente)))))}` : ""),
};

const daysTo = (r: Row, now: Date) => Math.round((Date.parse(`${when(r, "peremption")}T12:00:00Z`) - now.getTime()) / 86400000);
const pharmacy: Kind = {
  id: "pharmacy",
  stats: (rows, now) => [st("n", "Médicaments", rows.length, "blue"), st("expired", "Périmés", rows.filter((r) => daysTo(r, now) < 0).length, "red"), st("soon", "Péremption sous 60 jours", rows.filter((r) => { const d = daysTo(r, now); return d >= 0 && d <= 60; }).length, "amber"), st("value", "Valeur du stock", Math.round(sum(rows, (r) => n(r.data.quantite) * n(r.data.prix))), "green", { unit: FCFA })],
  chips: [{ id: "expired", label: "Périmés", test: (r, now) => daysTo(r, now) < 0 }, { id: "soon", label: "Bientôt périmés", test: (r, now) => { const d = daysTo(r, now); return d >= 0 && d <= 60; } }],
  badge: (r, now) => { const d = daysTo(r, now); return d < 0 ? { label: "Périmé", tone: "red" } : d <= 60 ? { label: `${d} j`, tone: "amber" } : null; },
};

const orders: Kind = {
  id: "orders",
  stats: (rows, now) => [st("n", "Commandes", rows.length, "blue"), st("open", "En cours", rows.filter((r) => is(r.data.statut, "en attente", "en préparation")).length, "amber"), st("ca", "Chiffre d'affaires", sum(rows.filter((r) => !is(r.data.statut, "annulée")), (r) => n(r.data.montant)), "green", { unit: FCFA }), st("day", "Aujourd'hui", rows.filter((r) => when(r) === day(now)).length, "slate")],
  chips: [today(), { id: "open", label: "En cours", test: (r) => is(r.data.statut, "en attente", "en préparation") }, { id: "pay", label: "À encaisser", test: (r) => is(r.data.statut, "servie / livrée") }],
  footer: (rows, fmt) => (rows.length ? `${rows.length} commande(s) · Total ${fmt(sum(rows.filter((r) => !is(r.data.statut, "annulée")), (r) => n(r.data.montant)))}` : ""),
};

const expenses: Kind = {
  id: "expenses",
  stats: (rows, now) => {
    const m = rows.filter((r) => when(r).slice(0, 7) === ym(now));
    const by = new Map<string, number>();
    for (const r of rows) by.set(String(r.data.categorie || "Autres"), (by.get(String(r.data.categorie || "Autres")) ?? 0) + n(r.data.montant));
    const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    return [st("month", "Dépenses du mois", sum(m, (r) => n(r.data.montant)), "red", { unit: FCFA, hint: `${m.length} dépense(s)` }), st("total", "Total des dépenses", sum(rows, (r) => n(r.data.montant)), "amber", { unit: FCFA }), st("top", top ? `Poste principal : ${top[0]}` : "Poste principal", top?.[1] ?? 0, "blue", { unit: FCFA }), st("n", "Nombre de dépenses", rows.length, "slate")];
  },
  chips: [month()],
  footer: (rows, fmt) => (rows.length ? `${rows.length} dépense(s) · Total ${fmt(sum(rows, (r) => n(r.data.montant)))}` : ""),
};

const rest = (r: Row) => (is(r.data.statut, "annulée") ? 0 : Math.max(0, n(r.data.montant) - n(r.data.montant_paye)));
const late = (r: Row, now: Date) => rest(r) > 0 && typeof r.data.echeance === "string" && r.data.echeance !== "" && String(r.data.echeance) < day(now);
const invoices: Kind = {
  id: "invoices",
  stats: (rows, now) => [st("billed", "Facturé", sum(rows.filter((r) => !is(r.data.statut, "annulée")), (r) => n(r.data.montant)), "blue", { unit: FCFA }), st("paid", "Encaissé", sum(rows, (r) => n(r.data.montant_paye)), "green", { unit: FCFA }), st("due", "Reste à encaisser", sum(rows, rest), "amber", { unit: FCFA }), st("late", "Factures en retard", rows.filter((r) => late(r, now)).length, "red")],
  chips: [{ id: "unpaid", label: "Impayées", test: (r) => rest(r) > 0 }, { id: "late", label: "En retard", test: late }],
  badge: (r, now) => (is(r.data.statut, "annulée") ? null : late(r, now) ? { label: "En retard", tone: "red" } : rest(r) > 0 ? { label: "Reste à payer", tone: "amber" } : { label: "Soldée", tone: "green" }),
  footer: (rows, fmt) => (rows.length ? `Facturé ${fmt(sum(rows.filter((r) => !is(r.data.statut, "annulée")), (r) => n(r.data.montant)))} · Encaissé ${fmt(sum(rows, (r) => n(r.data.montant_paye)))} · Reste ${fmt(sum(rows, rest))}` : ""),
};

const appointments: Kind = {
  id: "appointments",
  stats: (rows, now) => {
    const live = rows.filter((r) => !is(r.data.statut, "annulé", "absent"));
    const done = rows.filter((r) => is(r.data.statut, "terminé") && when(r).slice(0, 7) === ym(now));
    return [st("today", "Aujourd'hui", live.filter((r) => when(r) === day(now)).length, "blue"), st("next", "À venir", live.filter((r) => when(r) > day(now) && is(r.data.statut, "prévu", "confirmé")).length, "green"), st("done", "Terminés ce mois", done.length, "slate"), st("ca", "Chiffre du mois", sum(done, (r) => n(r.data.prix)), "amber", { unit: FCFA })];
  },
  chips: [today(), { id: "next", label: "À venir", test: (r, now) => when(r) > day(now) && is(r.data.statut, "prévu", "confirmé") }],
  badge: (r, now) => (!is(r.data.statut, "annulé", "absent", "terminé") && when(r) === day(now) ? { label: "Aujourd'hui", tone: "blue" } : null),
};

const repairs: Kind = {
  id: "repairs",
  stats: (rows, now) => [st("open", "En cours", rows.filter((r) => is(r.data.statut, "reçu", "diagnostic", "en réparation")).length, "amber"), st("ready", "Prêts à livrer", rows.filter((r) => is(r.data.statut, "prêt")).length, "green"), st("done", "Livrés ce mois", rows.filter((r) => is(r.data.statut, "livré") && when(r, "date_entree").slice(0, 7) === ym(now)).length, "slate"), st("ca", "Chiffre des réparations livrées", sum(rows.filter((r) => is(r.data.statut, "livré")), (r) => n(r.data.cout)), "blue", { unit: FCFA })],
  chips: [{ id: "open", label: "En cours", test: (r) => is(r.data.statut, "reçu", "diagnostic", "en réparation") }, { id: "ready", label: "Prêts", test: (r) => is(r.data.statut, "prêt") }],
};

const deliveries: Kind = {
  id: "deliveries",
  stats: (rows) => [st("todo", "À livrer", rows.filter((r) => is(r.data.statut, "à livrer")).length, "amber"), st("route", "En route", rows.filter((r) => is(r.data.statut, "en route")).length, "blue"), st("done", "Livrées", rows.filter((r) => is(r.data.statut, "livrée")).length, "green"), st("ca", "Chiffre des livraisons", sum(rows.filter((r) => is(r.data.statut, "livrée")), (r) => n(r.data.prix)), "slate", { unit: FCFA })],
  chips: [{ id: "open", label: "À livrer / en route", test: (r) => is(r.data.statut, "à livrer", "en route") }, today()],
};

const employees: Kind = {
  id: "employees",
  stats: (rows, now) => [st("n", "Effectif actif", rows.filter((r) => is(r.data.statut, "actif")).length, "blue"), st("leave", "En congé", rows.filter((r) => is(r.data.statut, "en congé")).length, "amber"), st("payroll", "Masse salariale mensuelle", sum(rows.filter((r) => is(r.data.statut, "actif")), (r) => n(r.data.salaire)), "green", { unit: FCFA }), st("new", "Embauches du mois", rows.filter((r) => when(r, "date_embauche").slice(0, 7) === ym(now)).length, "slate")],
  chips: [{ id: "active", label: "Actifs", test: (r) => is(r.data.statut, "actif") }, { id: "leave", label: "En congé", test: (r) => is(r.data.statut, "en congé") }],
  footer: (rows, fmt) => (rows.length ? `Masse salariale (actifs) ${fmt(sum(rows.filter((r) => is(r.data.statut, "actif")), (r) => n(r.data.salaire)))}` : ""),
};

const tasks: Kind = {
  id: "tasks",
  stats: (rows, now) => [st("todo", "À faire", rows.filter((r) => is(r.data.statut, "à faire")).length, "amber"), st("doing", "En cours", rows.filter((r) => is(r.data.statut, "en cours")).length, "blue"), st("done", "Terminées", rows.filter((r) => is(r.data.statut, "terminée")).length, "green"), st("late", "En retard", rows.filter((r) => !is(r.data.statut, "terminée") && typeof r.data.echeance === "string" && r.data.echeance !== "" && String(r.data.echeance) < day(now)).length, "red")],
  chips: [{ id: "open", label: "À faire / en cours", test: (r) => !is(r.data.statut, "terminée") }, { id: "late", label: "En retard", test: (r, now) => !is(r.data.statut, "terminée") && typeof r.data.echeance === "string" && r.data.echeance !== "" && String(r.data.echeance) < day(now) }],
  badge: (r) => (is(r.data.priorite, "haute") && !is(r.data.statut, "terminée") ? { label: "Urgent", tone: "red" } : null),
};

const payments: Kind = {
  id: "payments",
  stats: (rows, now) => { const t = rows.filter((r) => when(r) === day(now)), m = rows.filter((r) => when(r).slice(0, 7) === ym(now)); return [st("day", "Encaissé aujourd'hui", sum(t, (r) => n(r.data.montant)), "green", { unit: FCFA }), st("month", "Encaissé ce mois", sum(m, (r) => n(r.data.montant)), "blue", { unit: FCFA }), st("total", "Total encaissé", sum(rows, (r) => n(r.data.montant)), "amber", { unit: FCFA }), st("n", "Paiements", rows.length, "slate")]; },
  chips: [today(), month()],
  footer: (rows, fmt) => (rows.length ? `${rows.length} paiement(s) · Total ${fmt(sum(rows, (r) => n(r.data.montant)))}` : ""),
};

const reservations: Kind = {
  id: "reservations",
  stats: (rows, now) => [st("arr", "Arrivées aujourd'hui", rows.filter((r) => when(r, "arrivee") === day(now) && !is(r.data.statut, "annulée")).length, "blue"), st("stay", "En séjour", rows.filter((r) => is(r.data.statut, "arrivé")).length, "green"), st("next", "À venir", rows.filter((r) => when(r, "arrivee") > day(now) && is(r.data.statut, "confirmée", "en attente")).length, "amber"), st("ca", "Montant des réservations", sum(rows.filter((r) => !is(r.data.statut, "annulée")), (r) => n(r.data.montant)), "slate", { unit: FCFA })],
  chips: [{ id: "today", label: "Arrivées du jour", test: (r, now) => when(r, "arrivee") === day(now) }, { id: "stay", label: "En séjour", test: (r) => is(r.data.statut, "arrivé") }],
};

const rooms: Kind = {
  id: "rooms",
  stats: (rows) => [st("n", "Chambres", rows.length, "blue"), st("free", "Disponibles", rows.filter((r) => r.data.disponible === true).length, "green"), st("busy", "Occupées", rows.filter((r) => r.data.disponible === false).length, "amber"), st("avg", "Tarif moyen", rows.length ? Math.round(sum(rows, (r) => n(r.data.tarif)) / rows.length) : 0, "slate", { unit: FCFA })],
  chips: [{ id: "free", label: "Disponibles", test: (r) => r.data.disponible === true }, { id: "busy", label: "Occupées", test: (r) => r.data.disponible === false }],
};

const properties: Kind = {
  id: "properties",
  stats: (rows) => [st("n", "Biens", rows.length, "blue"), st("free", "Libres", rows.filter((r) => is(r.data.statut, "libre")).length, "green"), st("let", "Loués", rows.filter((r) => is(r.data.statut, "loué")).length, "amber"), st("rent", "Loyers attendus", sum(rows.filter((r) => is(r.data.statut, "loué")), (r) => n(r.data.loyer)), "slate", { unit: FCFA })],
  chips: [{ id: "free", label: "Libres", test: (r) => is(r.data.statut, "libre") }, { id: "let", label: "Loués", test: (r) => is(r.data.statut, "loué") }],
};

const tenants: Kind = {
  id: "tenants",
  stats: (rows) => [st("n", "Locataires", rows.length, "blue"), st("ok", "À jour", rows.filter((r) => r.data.a_jour === true).length, "green"), st("late", "En retard de paiement", rows.filter((r) => r.data.a_jour === false).length, "red"), st("rent", "Loyers mensuels", sum(rows, (r) => n(r.data.loyer)), "slate", { unit: FCFA })],
  chips: [{ id: "late", label: "En retard", test: (r) => r.data.a_jour === false }],
  badge: (r) => (r.data.a_jour === false ? { label: "En retard", tone: "red" } : r.data.a_jour === true ? { label: "À jour", tone: "green" } : null),
};

const KINDS: Record<string, Kind> = { ventes: sales, produits: stock, medicaments: pharmacy, commandes: orders, depenses: expenses, factures: invoices, rendezvous: appointments, reparations: repairs, livraisons: deliveries, employes: employees, taches: tasks, paiements: payments, reservations, chambres: rooms, biens: properties, locataires: tenants };

/** Type de module reconnu d'après sa clé et ses champs (null = affichage générique, avec les statistiques communes). */
export function kindOf(entity: Pick<Entity, "key" | "fields">): Kind | null {
  const k = KINDS[entity.key];
  if (!k) return null;
  // Les champs attendus doivent exister : un module renommé ou modifié par l'utilisateur garde l'affichage générique.
  const needs: Record<string, string[]> = { ventes: ["montant"], produits: ["quantite"], medicaments: ["peremption"], commandes: ["montant"], depenses: ["montant"], factures: ["montant"], rendezvous: ["date"], reparations: ["statut"], livraisons: ["statut"], employes: ["salaire"], taches: ["statut"], paiements: ["montant"], reservations: ["arrivee"], chambres: ["disponible"], biens: ["statut"], locataires: ["a_jour"] };
  return (needs[entity.key] ?? []).every((f) => entity.fields.some((x) => x.key === f)) ? k : null;
}
