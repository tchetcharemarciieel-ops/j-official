import { describe, expect, it } from "vitest";
import { composeSpec, diagnoseWithRules, detectSector } from "@/lib/generator";
import { autoFix, runChecks, summarize } from "@/lib/checks";
import { validateRecord, toCsv } from "@/lib/records";
import { can, readonlyFields } from "@/lib/permissions";
import { modifyWithRules } from "@/lib/modify-rules";
import { diffSpecs } from "@/lib/diff";
import { executePlan, planWithRules } from "@/lib/query";
import { computeWidget } from "@/lib/stats";
import { parseSpec, slugify, type AppSpec } from "@/lib/spec";
import { MODULES } from "@/lib/modules";

function restaurant(): AppSpec {
  const d = diagnoseWithRules({ problem: "Je veux gérer les commandes, les stocks et les dépenses de mon restaurant.", businessName: "Chez Mama" });
  return composeSpec(d);
}

describe("générateur", () => {
  it("détecte le secteur", () => {
    expect(detectSector("je veux suivre les réparations de mon garage")).toBe("garage");
    expect(detectSector("gérer les élèves et les paiements de mon école")).toBe("ecole");
  });

  it("produit des logiciels différents selon le besoin", () => {
    const resto = restaurant();
    const garage = composeSpec(diagnoseWithRules({ problem: "Je veux un logiciel pour suivre les réparations de mon garage.", businessName: "Garage Ndi" }));
    const resKeys = resto.entities.map((e) => e.key);
    const garKeys = garage.entities.map((e) => e.key);
    expect(resKeys).toContain("commandes");
    expect(resKeys).toContain("produits");
    expect(resKeys).toContain("depenses");
    expect(garKeys).toContain("reparations");
    expect(resKeys).not.toEqual(garKeys);
    expect(resto.name).toBe("Chez Mama");
  });

  it("pose des questions si la demande est imprécise", () => {
    const d = diagnoseWithRules({ problem: "J'ai besoin d'aide" });
    expect(d.questions.length).toBeGreaterThan(0);
  });

  it("convertit les relations vers des tables absentes", () => {
    const d = diagnoseWithRules({ problem: "réparations garage" });
    d.features = d.features.map((f) => ({ ...f, selected: f.id === "reparations" }));
    const spec = composeSpec(d);
    expect(spec.entities.find((e) => e.key === "reparations")!.fields.find((f) => f.key === "client")!.type).toBe("text");
  });

  it("chaque module de la bibliothèque passe les tests", () => {
    for (const m of MODULES) {
      const spec = composeSpec({
        source: "rules", businessName: "Test", sector: "interne", sectorLabel: "Test", mainProblem: "x",
        manualTasks: [], dataToKeep: [], users: "", automations: [], limits: [], questions: [],
        features: [{ id: m.id, title: m.title, description: "", selected: true }],
      });
      const s = summarize(runChecks(spec));
      expect(s.failed, m.id).toBe(0);
    }
  });
});

describe("tests automatiques", () => {
  it("passent sur un logiciel généré", () => {
    expect(summarize(runChecks(restaurant())).failed).toBe(0);
  });

  it("détectent et corrigent un indicateur invalide", () => {
    const spec = restaurant();
    spec.dashboard.push({ type: "sum", label: "Cassé", entity: "commandes", field: "statut" });
    expect(runChecks(spec).find((c) => c.id === "calculations")!.status).toBe("fail");
    const fixed = autoFix(spec);
    expect(runChecks(fixed).find((c) => c.id === "calculations")!.status).toBe("pass");
  });

  it("signalent les données conservées lors d'un retrait", () => {
    const before = restaurant();
    const after = structuredClone(before);
    after.entities = after.entities.filter((e) => e.key !== "depenses");
    const c = runChecks(after, before).find((x) => x.id === "data_preservation")!;
    expect(c.message).toContain("Dépenses");
  });
});

describe("validation des enregistrements", () => {
  const entity = restaurant().entities.find((e) => e.key === "commandes")!;
  it("refuse un champ obligatoire vide", () => {
    const r = validateRecord(entity, { reference: "", date: "2026-01-01", montant: 1000, statut: "Payée" });
    expect(r.ok).toBe(false);
  });
  it("normalise les montants et ignore les clés inconnues", () => {
    const r = validateRecord(entity, { reference: "C1", date: "2026-01-01", montant: "12 500", statut: "Payée", pirate: "x" });
    expect(r.ok && r.data.montant).toBe(12500);
    expect(r.ok && "pirate" in r.data).toBe(false);
  });
  it("refuse un choix hors liste", () => {
    expect(validateRecord(entity, { reference: "C1", date: "2026-01-01", montant: 1, statut: "Volée" }).ok).toBe(false);
  });
  it("neutralise les formules dans l'export CSV", () => {
    const csv = toCsv(entity, [{ data: { reference: "=HYPERLINK()", montant: 1 } }]);
    expect(csv).toContain("'=HYPERLINK()");
  });
});

describe("permissions", () => {
  it("rôles par défaut", () => {
    const e = restaurant().entities[0]!;
    expect(can(e, "viewer", "create")).toBe(false);
    expect(can(e, "employee", "delete")).toBe(false);
    expect(can(e, "owner", "delete")).toBe(true);
  });
  it("le propriétaire garde tous les droits malgré une surcharge", () => {
    const e = restaurant().entities[0]!;
    e.permissions = { owner: { read: false, create: false, update: false, delete: false, readonlyFields: [] } };
    expect(can(e, "owner", "read")).toBe(true);
  });
});

describe("modifications par règles", () => {
  it("ajoute un champ téléphone", () => {
    const r = modifyWithRules(restaurant(), "Ajoute un champ numéro de téléphone aux commandes");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.entities.find((e) => e.key === "commandes")!.fields.some((f) => f.type === "phone")).toBe(true);
  });
  it("ajoute une page employés et préserve l'existant", () => {
    const before = restaurant();
    const r = modifyWithRules(before, "Ajoute une page pour gérer les employés.");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.entities.some((e) => e.key === "employes")).toBe(true);
      expect(diffSpecs(before, r.spec).every((c) => c.kind === "added")).toBe(true);
    }
  });
  it("change les couleurs", () => {
    const r = modifyWithRules(restaurant(), "Change les couleurs en vert et blanc.");
    expect(r.ok && r.spec.theme.primary).toBe("#16a34a");
  });
  it("protège les prix pour les employés", () => {
    const r = modifyWithRules(restaurant(), "Permets à mon employé de consulter les commandes sans modifier les prix.");
    expect(r.ok).toBe(true);
    if (r.ok) expect(readonlyFields(r.spec.entities.find((e) => e.key === "commandes")!, "employee")).toContain("montant");
  });
  it("active l'export PDF", () => {
    const r = modifyWithRules(restaurant(), "Ajoute un export PDF.");
    expect(r.ok && r.spec.features.pdfExport).toBe(true);
  });
  it("ne modifie rien si la demande n'est pas comprise", () => {
    expect(modifyWithRules(restaurant(), "fais le café").ok).toBe(false);
  });
});

describe("assistant de données", () => {
  const spec = restaurant();
  const now = new Date("2026-10-21T10:00:00");
  const rows = [
    { id: "a", data: { reference: "A", date: "2026-10-20", montant: 10000, statut: "Payée" }, created_at: "2026-10-20T08:00:00Z" },
    { id: "b", data: { reference: "B", date: "2026-10-19", montant: 5000, statut: "En attente" }, created_at: "2026-10-19T08:00:00Z" },
    { id: "c", data: { reference: "C", date: "2026-09-01", montant: 99999, statut: "Payée" }, created_at: "2026-09-01T08:00:00Z" },
  ];
  it("calcule un total sur la semaine sans inventer", () => {
    const plan = planWithRules(spec, "Combien ai-je vendu cette semaine en commandes ?");
    expect(plan.operation).toBe("sum");
    const a = executePlan(spec, plan, rows, now);
    expect(a.answer).toContain("15");
    expect(a.period).toContain("semaine");
  });
  it("calcule les indicateurs", () => {
    const w = spec.dashboard.find((x) => x.type === "sum")!;
    const r = computeWidget(spec, w, rows);
    expect(r.kind === "number" && r.value).toBe(114999);
  });
});

describe("utilitaires", () => {
  it("slug", () => expect(slugify("Garage Ndi & Fils !")).toBe("garage-ndi-fils"));
  it("rejette une spec invalide", () => expect(parseSpec({ name: "" }).ok).toBe(false));
});

describe("données d'exemple", () => {
  it("toutes les fiches d'exemple des modules sont valides", async () => {
    const { sampleRecord } = await import("@/lib/checks");
    for (const m of MODULES)
      for (let i = 0; i < 6; i++) {
        const r = validateRecord(m.entity, sampleRecord(m.entity, i));
        expect(r.ok, `${m.id} #${i} ${JSON.stringify(r)}`).toBe(true);
      }
  });
});

describe("import CSV", () => {
  it("lit un CSV au point-virgule et détecte les types", async () => {
    const { parseCsv, detectColumns, prepareValue } = await import("@/lib/csv");
    const rows = parseCsv('Nom;Prix;Date\n"Riz; 25 kg";12 500;03/10/2026\nSucre;800;04/10/2026\n');
    expect(rows).toEqual([["Nom", "Prix", "Date"], ["Riz; 25 kg", "12 500", "03/10/2026"], ["Sucre", "800", "04/10/2026"]]);
    const cols = detectColumns(rows[0]!, rows.slice(1));
    expect(cols.map((c) => c.type)).toEqual(["text", "money", "date"]);
    expect(prepareValue("date", "03/10/2026")).toBe("2026-10-03");
    expect(prepareValue("money", "12 500")).toBe("12500");
  });
});
