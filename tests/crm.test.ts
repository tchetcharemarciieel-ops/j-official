import { describe, expect, it } from "vitest";
import { initials, interactionsFor, moduleStats, relatedFields, statusTone } from "@/lib/crm";
import { groupEntities, orderEntities, profileFor } from "@/lib/ui-profile";
import { composeSpec, diagnoseWithRules } from "@/lib/generator";
import { getModule } from "@/lib/modules";
import { appSpecSchema } from "@/lib/spec";
import type { Row } from "@/lib/stats";

const NOW = new Date("2026-11-20T10:00:00Z");
const row = (id: string, created_at: string, data: Row["data"]): Row => ({ id, created_at, data });
const spec = appSpecSchema.parse({ name: "Mon commerce", sector: "boutique", entities: [getModule("clients")!.entity, getModule("ventes")!.entity] });
const clients = spec.entities[0]!, ventes = spec.entities[1]!;
const relKey = ventes.fields.find((f) => f.type === "relation")?.key;

describe("CRM : statistiques d'un module", () => {
  it("compte le total, les nouveaux du mois et les actifs/inactifs d'après le statut", () => {
    const rows = [row("a", "2026-11-02T00:00:00Z", { nom: "Awa", statut: "Actif" }), row("b", "2026-10-02T00:00:00Z", { nom: "Binta", statut: "Inactif" }), row("c", "2026-09-02T00:00:00Z", { nom: "Coly", statut: "Actif" })];
    const s = moduleStats(spec, clients, rows, { clients: rows }, NOW);
    expect(Object.fromEntries(s.map((x) => [x.id, x.value]))).toMatchObject({ total: 3, new: 1, active: 2, inactive: 1 });
  });
  it("retrouve les interactions d'un client dans les autres modules, la plus récente d'abord", () => {
    expect(relKey).toBe("client");
    expect(relatedFields(spec, clients).map((r) => r.entity.key)).toContain("ventes");
    const recs = { clients: [row("a", "2026-01-01T00:00:00Z", { nom: "Awa" })], ventes: [row("v1", "2026-11-01T00:00:00Z", { client: "a", montant: 5000, produit: "Riz" }), row("v2", "2026-11-10T00:00:00Z", { client: "a", montant: 2000, produit: "Huile" }), row("v3", "2026-11-12T00:00:00Z", { client: "zzz", montant: 9 })] };
    const it = interactionsFor(spec, clients, "a", recs);
    expect(it.map((x) => x.id)).toEqual(["v2", "v1"]);
    expect(it[0]!.detail).toContain("2");
  });
  it("rapproche aussi un champ texte « Client » par le nom (anciens logiciels)", () => {
    const old = appSpecSchema.parse({ ...spec, entities: [clients, { ...ventes, fields: ventes.fields.map((f) => (f.key === "client" ? { ...f, type: "text", relation: undefined } : f)) }] });
    const recs = { clients: [row("a", "2026-01-01T00:00:00Z", { nom: "Séraphine" })], ventes: [row("v1", "2026-11-01T00:00:00Z", { client: "seraphine", montant: 10 })] };
    expect(interactionsFor(old, old.entities[0]!, "a", recs).map((x) => x.id)).toEqual(["v1"]);
  });
  it("sans statut Actif/Inactif : actifs = clients liés à une activité des 90 derniers jours", () => {
    const noStatus = appSpecSchema.parse({ ...spec, entities: [{ ...clients, fields: clients.fields.filter((f) => f.key !== "statut") }, ventes] });
    const rows = [row("a", "2026-01-01T00:00:00Z", { nom: "Awa" }), row("b", "2026-01-01T00:00:00Z", { nom: "Binta" })];
    const recs = { clients: rows, ventes: [row("v1", "2026-11-01T00:00:00Z", { client: "a", montant: 1 }), row("v0", "2025-01-01T00:00:00Z", { client: "b", montant: 1 })] };
    const s = moduleStats(noStatus, noStatus.entities[0]!, rows, recs, NOW);
    expect(s.find((x) => x.id === "active")!.value).toBe(1);
    expect(s.find((x) => x.id === "inactive")!.value).toBe(1);
  });
  it("couleurs de statut et initiales", () => {
    expect(statusTone("Actif")).toBe("green");
    expect(statusTone("En attente")).toBe("amber");
    expect(statusTone("Inactif")).toBe("red");
    expect(initials("Awa dupont mbaye")).toBe("AD");
  });
});

describe("identité d'interface par métier", () => {
  const gen = (p: string) => composeSpec(diagnoseWithRules({ problem: p }));
  it("ordonne les modules et titre les rubriques selon le métier", () => {
    const resto = gen("Je veux gérer les commandes, la cuisine, la caisse et les dépenses de mon restaurant.");
    const garage = gen("Je veux suivre les réparations, les pièces, les clients et les paiements de mon garage.");
    expect(profileFor(resto).main).toBe("Service");
    expect(profileFor(garage).main).toBe("Atelier");
    expect(orderEntities(resto)[0]!.key).toMatch(/commande/);
    expect(orderEntities(garage)[0]!.key).toMatch(/reparation/);
    const g = groupEntities(resto);
    expect(g.length).toBeGreaterThan(1);
    expect(g.flatMap((x) => x.entities).length).toBe(resto.entities.length);
    expect(g.map((x) => x.title)).toContain("Finances");
  });
  it("aucun module perdu et ordre stable pour un métier inconnu", () => {
    const s = appSpecSchema.parse({ name: "X", sector: "autre", entities: [getModule("taches")!.entity, getModule("clients")!.entity] });
    expect(orderEntities(s).map((e) => e.key).sort()).toEqual(["clients", "taches"]);
  });
});
