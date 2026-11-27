import { describe, expect, it } from "vitest";
import { autoFix, runChecks } from "@/lib/checks";
import { diffSpecs } from "@/lib/diff";
import { getModule } from "@/lib/modules";
import { withModule, withoutEntity } from "@/lib/modify-manual";
import { appSpecSchema, type AppSpec } from "@/lib/spec";

function base(): AppSpec {
  const clients = getModule("clients")!;
  return appSpecSchema.parse({ name: "Mon salon", sector: "services", entities: [clients.entity], dashboard: clients.widgets });
}

describe("modification manuelle d'un logiciel", () => {
  it("ajoute une fonctionnalité sans toucher aux autres", () => {
    const before = base();
    const sales = getModule("ventes") ?? getModule("depenses")!;
    const after = withModule(before, sales);
    expect(after.entities.map((e) => e.key)).toContain(sales.entity.key);
    expect(after.entities[0]).toEqual(before.entities[0]);
    expect(diffSpecs(before, after).some((c) => c.kind === "added")).toBe(true);
    expect(runChecks(autoFix(after), before).some((c) => c.status === "fail")).toBe(false);
  });
  it("ne duplique pas une fonctionnalité déjà présente", () => {
    const before = base();
    expect(withModule(before, getModule("clients")!).entities).toHaveLength(1);
  });
  it("retire une table et ses indicateurs, sans erreur de test", () => {
    const sales = getModule("ventes") ?? getModule("depenses")!;
    const full = withModule(base(), sales);
    const less = withoutEntity(full, sales.entity.key);
    expect(less.entities.some((e) => e.key === sales.entity.key)).toBe(false);
    expect(less.dashboard.some((w) => w.entity === sales.entity.key)).toBe(false);
    expect(runChecks(autoFix(less), full).some((c) => c.status === "fail")).toBe(false);
    expect(diffSpecs(full, less).some((c) => c.kind === "removed")).toBe(true);
  });
});
