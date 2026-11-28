import { describe, expect, it } from "vitest";
import { ago, globalSearch, monthTrend, recentActivity } from "@/lib/dashboard-stats";
import { getModule } from "@/lib/modules";
import { appSpecSchema } from "@/lib/spec";
import type { Row } from "@/lib/stats";

const spec = appSpecSchema.parse({ name: "Mon commerce", sector: "commerce", entities: [getModule("clients")!.entity, getModule("ventes")!.entity] });
const NOW = new Date("2026-11-15T10:00:00Z");
const row = (id: string, created_at: string, data: Row["data"]): Row => ({ id, created_at, data });

describe("statistiques du tableau de bord", () => {
  it("compare ce mois-ci au mois précédent, sans pourcentage sans base de comparaison", () => {
    const rows = [row("1", "2026-10-03T00:00:00Z", { montant: 100 }), row("2", "2026-11-02T00:00:00Z", { montant: 150 }), row("3", "2026-11-09T00:00:00Z", { montant: 50 })];
    expect(monthTrend(rows, { field: "montant" }, NOW)).toEqual({ current: 200, previous: 100, pct: 100 });
    expect(monthTrend(rows, {}, NOW)).toEqual({ current: 2, previous: 1, pct: 100 });
    expect(monthTrend([row("4", "2026-11-02T00:00:00Z", {})], {}, NOW).pct).toBeNull();
    expect(monthTrend([], {}, NOW)).toEqual({ current: 0, previous: 0, pct: null });
  });
  it("utilise la date choisie plutôt que la date de création", () => {
    const rows = [row("1", "2026-11-14T00:00:00Z", { date: "2026-10-20", montant: 40 })];
    expect(monthTrend(rows, { field: "montant", dateField: "date" }, NOW)).toMatchObject({ current: 0, previous: 40 });
  });
  it("liste l'activité récente de tous les modules, plus récente d'abord", () => {
    const clients = spec.entities[0]!, ventes = spec.entities[1]!;
    const act = recentActivity(spec, { [clients.key]: [row("a", "2026-11-01T00:00:00Z", { nom: "Awa" })], [ventes.key]: [row("b", "2026-11-10T00:00:00Z", {})] }, 5);
    expect(act.map((a) => a.id)).toEqual(["b", "a"]);
    expect(act[1]!.title).toBe("Awa");
  });
  it("recherche sans accent ni casse, seulement dans les modules lisibles", () => {
    const clients = spec.entities[0]!;
    const recs = { [clients.key]: [row("a", "2026-11-01T00:00:00Z", { nom: "Séraphine Mbaye" })] };
    expect(globalSearch(spec, recs, "seraphine", [clients.key])[0]?.title).toBe("Séraphine Mbaye");
    expect(globalSearch(spec, recs, "seraphine", [])).toHaveLength(0);
    expect(globalSearch(spec, recs, "s", [clients.key])).toHaveLength(0);
  });
  it("formate le temps écoulé", () => {
    expect(ago("2026-11-15T09:30:00Z", NOW)).toBe("il y a 30 min");
    expect(ago("2026-11-15T05:00:00Z", NOW)).toBe("il y a 5 h");
    expect(ago("2026-11-12T10:00:00Z", NOW)).toBe("il y a 3 j");
  });
});
