import { describe, expect, it } from "vitest";
import { autoFix, runChecks } from "@/lib/checks";
import { dashboardFor, sortWidgets } from "@/lib/auto-dashboard";
import { composeSpec, diagnoseWithRules } from "@/lib/generator";
import { computeWidget } from "@/lib/stats";
import { effectiveWorkspace } from "@/lib/workspace";

const CASES: [string, string][] = [
  ["restaurant", "Je veux gérer les commandes, la cuisine, la caisse et les dépenses de mon restaurant."],
  ["garage", "Je veux suivre les réparations, les pièces, les clients et les paiements de mon garage."],
  ["école", "Je veux gérer les élèves, les inscriptions et les paiements de scolarité de mon école."],
  ["transport", "Je veux suivre les livraisons, les chauffeurs et les véhicules de mon service de transport."],
  ["pharmacie", "Je veux gérer le stock des médicaments et les dates de péremption de ma pharmacie."],
  ["salon", "Je veux gérer les rendez-vous, les clients, les prestations et la caisse de mon salon."],
  ["boutique", "Je veux suivre mes ventes, mon stock et les crédits de mes clients dans ma boutique."],
];

describe("génération 2D sur plusieurs secteurs", () => {
  const specs = CASES.map(([name, problem]) => ({ name, spec: composeSpec(diagnoseWithRules({ problem })) }));
  it.each(specs.map((s) => [s.name, s.spec] as const))("%s : interface 2D complète, sans plan 3D, tests réussis", (_name, spec) => {
    expect(spec.workspace?.enabled).toBe(false);
    expect(effectiveWorkspace(spec).enabled).toBe(false);
    expect(spec.workspace?.stations).toHaveLength(0);
    const checks = runChecks(autoFix(spec));
    expect(checks.filter((c) => c.status === "fail")).toEqual([]);
    const widgets = sortWidgets(dashboardFor(spec));
    expect(widgets.length).toBeGreaterThanOrEqual(4);
    expect(widgets.length).toBeLessThanOrEqual(12);
    // cartes de chiffres d'abord ; chaque indicateur se calcule sur les fiches (vides ici : valeur 0, jamais inventée)
    expect(widgets[0]!.type === "count" || widgets[0]!.type === "sum").toBe(true);
    for (const w of widgets) {
      const r = computeWidget(spec, w, []);
      if (r.kind === "number") expect(r.value).toBe(0);
    }
    expect(spec.entities.length).toBeGreaterThanOrEqual(2);
  });
  it("deux secteurs différents ne reçoivent pas les mêmes modules", () => {
    const keys = (n: string) => specs.find((s) => s.name === n)!.spec.entities.map((e) => e.key).join(",");
    expect(keys("restaurant")).not.toBe(keys("garage"));
    expect(keys("garage")).not.toBe(keys("salon"));
    expect(new Set(specs.map((s) => s.spec.entities.map((e) => e.key).join(","))).size).toBeGreaterThanOrEqual(5);
  });
  it("conserve les indicateurs prévus et n'ajoute que des indicateurs valides", () => {
    for (const { spec } of specs) {
      const widgets = dashboardFor(spec);
      for (const w of spec.dashboard) expect(widgets).toContainEqual(w);
      for (const w of widgets) {
        const e = spec.entities.find((x) => x.key === w.entity);
        expect(e).toBeTruthy();
        if (w.field) expect(e!.fields.some((f) => f.key === w.field)).toBe(true);
      }
    }
  });
});
