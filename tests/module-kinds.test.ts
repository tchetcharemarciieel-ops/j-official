import { describe, expect, it } from "vitest";
import { kindOf } from "@/lib/module-kinds";
import { MODULES, getModule } from "@/lib/modules";
import type { Row } from "@/lib/stats";

const NOW = new Date("2026-11-20T10:00:00Z");
const row = (id: string, data: Row["data"], created_at = "2026-11-01T00:00:00Z"): Row => ({ id, created_at, data });
const stats = (key: string, rows: Row[]) => Object.fromEntries(kindOf(getModule(key)!.entity)!.stats(rows, NOW).map((s) => [s.id, s.value]));

describe("modules : statistiques propres à chaque type", () => {
  it("ventes : chiffre du jour et du mois, panier moyen, crédits", () => {
    const rows = [row("1", { date: "2026-11-20", montant: 5000, paiement: "Espèces" }), row("2", { date: "2026-11-20", montant: 3000, paiement: "Crédit" }), row("3", { date: "2026-11-05", montant: 1000, paiement: "Carte" }), row("4", { date: "2026-10-30", montant: 9999, paiement: "Carte" })];
    expect(stats("ventes", rows)).toEqual({ day: 8000, month: 9000, avg: 3000, credit: 1 });
  });
  it("produits : valeur du stock, stock bas et ruptures d'après le seuil", () => {
    const rows = [row("1", { nom: "Riz", quantite: 3, seuil: 5, prix_achat: 1000 }), row("2", { nom: "Huile", quantite: 0, seuil: 5, prix_achat: 2000 }), row("3", { nom: "Sucre", quantite: 20, seuil: 5, prix_achat: 500 })];
    expect(stats("produits", rows)).toEqual({ n: 3, value: 13000, low: 1, out: 1 });
    const k = kindOf(getModule("produits")!.entity)!;
    expect(k.badge!(rows[0]!, NOW)).toEqual({ label: "Stock bas", tone: "amber" });
    expect(k.badge!(rows[1]!, NOW)!.label).toBe("Rupture");
    expect(k.chips.find((c) => c.id === "low")!.test(rows[0]!, NOW)).toBe(true);
  });
  it("factures : facturé, encaissé, reste, retards", () => {
    const rows = [row("1", { montant: 10000, montant_paye: 4000, echeance: "2026-11-01", statut: "À payer" }), row("2", { montant: 5000, montant_paye: 5000, echeance: "2026-11-30", statut: "Payée" }), row("3", { montant: 7000, montant_paye: 0, statut: "Annulée" })];
    expect(stats("factures", rows)).toEqual({ billed: 15000, paid: 9000, due: 6000, late: 1 });
    const k = kindOf(getModule("factures")!.entity)!;
    expect(k.badge!(rows[0]!, NOW)!.label).toBe("En retard");
    expect(k.badge!(rows[1]!, NOW)!.label).toBe("Soldée");
    expect(k.badge!(rows[2]!, NOW)).toBeNull();
  });
  it("rendez-vous, réparations, employés, tâches, médicaments", () => {
    expect(stats("rendezvous", [row("1", { date: "2026-11-20", statut: "Confirmé" }), row("2", { date: "2026-11-25", statut: "Prévu" }), row("3", { date: "2026-11-20", statut: "Annulé" }), row("4", { date: "2026-11-10", statut: "Terminé", prix: 4000 })])).toEqual({ today: 1, next: 1, done: 1, ca: 4000 });
    expect(stats("reparations", [row("1", { statut: "En réparation" }), row("2", { statut: "Prêt" }), row("3", { statut: "Livré", cout: 30000, date_entree: "2026-11-02" })])).toMatchObject({ open: 1, ready: 1, done: 1, ca: 30000 });
    expect(stats("employes", [row("1", { statut: "Actif", salaire: 100000 }), row("2", { statut: "En congé", salaire: 50000 }), row("3", { statut: "Parti", salaire: 70000 })])).toMatchObject({ n: 1, leave: 1, payroll: 100000 });
    expect(stats("taches", [row("1", { statut: "À faire", echeance: "2026-11-01" }), row("2", { statut: "Terminée", echeance: "2026-11-01" })])).toMatchObject({ todo: 1, done: 1, late: 1 });
    expect(stats("medicaments", [row("1", { peremption: "2026-11-01", quantite: 2, prix: 100 }), row("2", { peremption: "2026-12-15", quantite: 1, prix: 50 }), row("3", { peremption: "2028-01-01", quantite: 1, prix: 10 })])).toMatchObject({ n: 3, expired: 1, soon: 1 });
  });
  it("totaux du bas de tableau et modules inconnus", () => {
    const k = kindOf(getModule("ventes")!.entity)!;
    expect(k.footer!([row("1", { date: "2026-11-20", montant: 4000 }), row("2", { date: "2026-11-20", montant: 2000 })], (x) => `${x}F`)).toBe("2 vente(s) · Total 6000F · Panier moyen 3000F");
    expect(k.footer!([], (x) => `${x}`)).toBe("");
    expect(kindOf({ key: "autre", fields: [] })).toBeNull();
    // un module renommé sans le champ attendu garde l'affichage générique
    expect(kindOf({ key: "ventes", fields: getModule("ventes")!.entity.fields.filter((f) => f.key !== "montant") })).toBeNull();
  });
  it("chaque module du catalogue a des statistiques valides (aucune valeur non numérique)", () => {
    for (const m of MODULES) {
      const k = kindOf(m.entity);
      if (!k) continue;
      for (const s of k.stats([], NOW)) expect(Number.isFinite(s.value)).toBe(true);
      for (const s of k.stats([row("1", {})], NOW)) expect(Number.isFinite(s.value)).toBe(true);
    }
  });
});
