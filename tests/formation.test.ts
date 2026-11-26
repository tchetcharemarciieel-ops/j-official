import { describe, expect, it } from "vitest";
import { formationFor } from "@/lib/formation";
import type { AppSpec } from "@/lib/spec";

const clients = {
  key: "clients", label: "Client", labelPlural: "Clients", icon: "👤", description: "Vos clientes.", permissions: {},
  fields: [
    { key: "nom", label: "Nom", type: "text", required: true, showInTable: true },
    { key: "statut", label: "Statut", type: "select", options: ["Nouveau", "Fidèle"], required: false, showInTable: true },
  ],
};
const spec = {
  name: "Mon salon", sector: "services", description: "", welcome: "", automations: [],
  dashboard: [{ type: "count", label: "Clients", entity: "clients" }],
  entities: [clients],
} as unknown as AppSpec;

describe("formation par logiciel", () => {
  it("construit une leçon par table pour un logiciel sur mesure", () => {
    const own = formationFor(spec).find((m) => m.id === "logiciel")!;
    expect(own.title).toContain("Mon salon");
    const text = own.lessons[0]!.steps.join(" ");
    expect(text).toContain("Nom");
    expect(text).toContain("Nouveau, Fidèle");
    expect(own.lessons.some((l) => l.title.includes("tableau de bord"))).toBe(true);
  });
  it("utilise les leçons du type pour Shop, Bureau et Transport", () => {
    for (const m of ["shop", "bureau", "transport"] as const) expect(formationFor({ ...spec, module: m }).some((x) => x.id === m)).toBe(true);
  });
});
