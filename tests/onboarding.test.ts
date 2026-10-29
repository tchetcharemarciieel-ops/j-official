import { describe, expect, it } from "vitest";
import { onboardingSchema, starterProblem, suggestions } from "@/lib/onboarding";

const base = { discovery: "tiktok", profile: "proprietaire", sector: "restaurant", tools: ["caisse", "stocks"], teamSize: "2-5", hasRoles: "non", devices: ["telephone"], country: "République centrafricaine" };

describe("questionnaire d'inscription", () => {
  it("accepte des réponses complètes", () => {
    expect(onboardingSchema.safeParse(base).success).toBe(true);
  });
  it("limite les choix multiples à deux", () => {
    expect(onboardingSchema.safeParse({ ...base, tools: ["caisse", "stocks", "clients"] }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, devices: ["telephone", "ordinateur", "tablette"] }).success).toBe(false);
  });
  it("exige une précision pour « Autre » et des rôles si « Oui »", () => {
    expect(onboardingSchema.safeParse({ ...base, sector: "autre" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, sector: "autre", sectorOther: "Salon de coiffure" }).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...base, tools: ["autre"] }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, hasRoles: "oui" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, hasRoles: "oui", roles: ["gerant", "caissier"] }).success).toBe(true);
  });
  it("efface les précisions inutiles", () => {
    const r = onboardingSchema.parse({ ...base, sectorOther: "x", roles: ["gerant"] });
    expect(r.sectorOther).toBe("");
    expect(r.roles).toEqual([]);
  });
  it("personnalise selon le secteur, sans rien inventer", () => {
    const resto = suggestions(onboardingSchema.parse(base));
    expect(resto[0]!.title).toMatch(/restaurant/i);
    expect(suggestions(onboardingSchema.parse({ ...base, sector: "hotel" }))[0]!.title).toMatch(/hôtel/i);
    expect(suggestions(onboardingSchema.parse({ ...base, sector: "garage" }))[0]!.title).toMatch(/garage/i);
    expect(suggestions(onboardingSchema.parse({ ...base, sector: "pharmacie" }))[0]!.title).toBe("Caisse et ventes");
    expect(starterProblem(onboardingSchema.parse(base))).toContain("Caisse et ventes");
  });
});
