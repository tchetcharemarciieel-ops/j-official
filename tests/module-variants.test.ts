import { describe, expect, it } from "vitest";
import { MODULES } from "@/lib/modules";
import { VARIANTS, adaptModule, getModuleFor } from "@/lib/module-variants";
import { SECTORS, composeSpec } from "@/lib/generator";
import { TEMPLATES } from "@/lib/templates";
import { appSpecSchema } from "@/lib/spec";

describe("Modules adaptés à chaque métier", () => {
  it("ne change jamais les identifiants des tables ni des champs de base", () => {
    for (const [sector, mods] of Object.entries(VARIANTS)) {
      expect(SECTORS[sector], `secteur ${sector}`).toBeTruthy();
      for (const id of Object.keys(mods)) {
        const base = MODULES.find((m) => m.id === id);
        expect(base, `${sector}/${id}`).toBeTruthy();
        const a = adaptModule(base!, sector);
        expect(a.entity.key).toBe(base!.entity.key);
        const keys = a.entity.fields.map((f) => f.key);
        expect(new Set(keys).size, `${sector}/${id} doublons`).toBe(keys.length);
        for (const f of base!.entity.fields) if (!mods[id]!.remove?.includes(f.key)) expect(keys).toContain(f.key);
        for (const w of a.widgets) {
          if (w.entity === a.entity.key && "field" in w && w.field) expect(keys, `${sector}/${id} widget ${w.label}`).toContain(w.field);
        }
      }
    }
  });
  it("adapte libellés, listes et champs selon le secteur sans modifier le module de base", () => {
    const base = MODULES.find((m) => m.id === "rendezvous")!;
    const before = JSON.stringify(base);
    const resto = getModuleFor("rendezvous", "restaurant")!;
    expect(resto.title).toBe("Réservations de tables");
    expect(resto.entity.fields.map((f) => f.key)).toContain("couverts");
    const garage = getModuleFor("rendezvous", "garage")!;
    expect(garage.entity.fields.find((f) => f.key === "prestation")!.options).toContain("Vidange");
    expect(getModuleFor("rendezvous", "salon")!.entity.fields.find((f) => f.key === "prestation")!.options).toContain("Tresses");
    expect(getModuleFor("depenses", "transport")!.entity.fields.find((f) => f.key === "categorie")!.options).toContain("Carburant");
    expect(getModuleFor("rendezvous", null)!.title).toBe("Gestion des rendez-vous");
    expect(JSON.stringify(base)).toBe(before);
  });
  it("les champs demandés restent présents dans les six modules de base", () => {
    const need: Record<string, string[]> = { rendezvous: ["client", "nom_client", "date", "heure", "prestation", "prix", "statut"], clients: ["nom", "telephone", "email", "adresse", "notes"], ventes: ["date", "article", "quantite", "montant", "paiement"], employes: ["nom", "poste", "telephone", "date_embauche", "salaire"], depenses: ["date", "libelle", "categorie", "montant"], factures: ["numero", "client", "date", "montant", "statut"] };
    for (const [id, keys] of Object.entries(need)) expect(MODULES.find((m) => m.id === id)!.entity.fields.map((f) => f.key)).toEqual(expect.arrayContaining(keys));
  });
  it("tous les modèles de logiciels restent valides avec les modules adaptés", () => {
    for (const t of TEMPLATES) {
      const spec = t.build();
      expect(appSpecSchema.safeParse(spec).success, t.id).toBe(true);
    }
    const salon = composeSpec({ source: "rules", businessName: "Salon Awa", sector: "salon", sectorLabel: "Services", mainProblem: "x", causes: [], solutions: [], manualTasks: [], dataToKeep: [], users: "", automations: [], limits: [], questions: [], features: ["rendezvous", "clients", "employes", "depenses", "factures", "ventes"].map((id) => ({ id, title: id, description: "", selected: true })) });
    expect(appSpecSchema.safeParse(salon).success).toBe(true);
    expect(salon.entities.find((e) => e.key === "rendezvous")!.fields.find((f) => f.key === "employe")!.label).toBe("Coiffeur / esthéticienne");
  });
});
