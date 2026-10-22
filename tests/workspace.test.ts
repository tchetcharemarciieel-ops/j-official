import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/templates";
import { appSpecSchema, type AppSpec } from "@/lib/spec";
import { assignCrew, buildWorkspace, effectiveWorkspace, layoutForSector, placeStations, recentActivity, sanitizeWorkspace, stationStats } from "@/lib/workspace";
import { autoFix, runChecks } from "@/lib/checks";
import type { Row } from "@/lib/stats";

const spec = (id: string): AppSpec => TEMPLATES.find((t) => t.id === id)!.build();

describe("espace de travail 3D", () => {
  it("restaurant : cuisine, réserve, caisse et statistiques, tous reliés à de vrais modules", () => {
    const s = spec("restaurant");
    const ws = s.workspace!;
    expect(ws.layout).toBe("restaurant");
    const keys = new Set(s.entities.map((e) => e.key));
    for (const st of ws.stations) expect(st.target === "__dashboard" || keys.has(st.target)).toBe(true);
    const kinds = ws.stations.map((st) => st.kind);
    expect(kinds).toEqual(expect.arrayContaining(["stats_board", "kitchen", "stock", "cashier"]));
    expect(ws.stations.find((st) => st.kind === "kitchen")!.target).toBe("commandes");
  });

  it("s'adapte à chaque métier", () => {
    expect(spec("garage").workspace!.layout).toBe("garage");
    expect(spec("garage").workspace!.stations.some((st) => st.kind === "repair_bay")).toBe(true);
    expect(spec("pharmacie").workspace!.layout).toBe("pharmacie");
    expect(spec("boutique").workspace!.stations.some((st) => st.kind === "cashier")).toBe(true);
    expect(layoutForSector("Agence de communication")).toBe("bureau");
    for (const t of TEMPLATES) {
      const s = t.build();
      expect(appSpecSchema.safeParse(s).success).toBe(true);
      expect(runChecks(s).find((c) => c.id === "workspace")!.status).toBe("pass");
    }
  });

  it("les anciens logiciels sans espace reçoivent un espace par défaut", () => {
    const { workspace: _w, ...old } = spec("restaurant");
    const parsed = appSpecSchema.parse(old);
    expect(parsed.workspace).toBeUndefined();
    expect(effectiveWorkspace(parsed).stations.length).toBeGreaterThan(2);
  });

  it("retire les postes de modules supprimés et ajoute ceux des nouveaux modules", () => {
    const s = spec("restaurant");
    const broken: AppSpec = { ...s, entities: s.entities.filter((e) => e.key !== "depenses") };
    expect(runChecks(broken).find((c) => c.id === "workspace")!.status).toBe("fail");
    const fixed = autoFix(broken);
    expect(fixed.workspace!.stations.some((st) => st.target === "depenses")).toBe(false);
    const hidden = sanitizeWorkspace({ ...s.workspace!, hiddenEntities: ["clients"] }, s);
    expect(hidden.stations.some((st) => st.target === "clients")).toBe(false);
    const added = sanitizeWorkspace({ ...s.workspace!, stations: s.workspace!.stations.filter((st) => st.target !== "clients") }, s);
    expect(added.stations.some((st) => st.target === "clients")).toBe(true);
    expect(placeStations(added).every((st) => Number.isFinite(st.x) && Number.isFinite(st.z))).toBe(true);
  });

  it("indicateurs calculés sur les données, sans chiffre inventé", () => {
    const s = spec("restaurant");
    const now = new Date("2026-10-22T10:00:00");
    const rows: Row[] = [
      { id: "1", created_at: "2026-10-22T08:00:00Z", data: { statut: "En préparation", montant: 5000 } },
      { id: "2", created_at: "2026-10-21T08:00:00Z", data: { statut: "Payée", montant: 7000 } },
    ];
    const st = stationStats(s, "commandes", rows, now)!;
    expect(st.total).toBe(2);
    expect(st.today).toBe(1);
    expect(st.open).toBe(1);
    expect(stationStats(s, "commandes", [], now)!.total).toBe(0);
    expect(recentActivity(s, s.workspace!, (k) => (k === "commandes" ? rows : []))[0]!.id).toBe("1");
  });

  it("place le propriétaire aux statistiques et répartit l'équipe", () => {
    const ws = buildWorkspace(spec("restaurant"));
    const crew = assignCrew(ws.stations, [
      { id: "a", name: "Awa", role: "owner" },
      { id: "b", name: "Bertin", role: "employee" },
    ]);
    expect(crew.get("st_tableau")!.map((m) => m.name)).toEqual(["Awa"]);
    expect([...crew.values()].flat()).toHaveLength(2);
  });
});
