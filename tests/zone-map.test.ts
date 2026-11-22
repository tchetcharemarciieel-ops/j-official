import { describe, expect, it } from "vitest";
import { zoneForEntity } from "@/lib/zone-map";

describe("Un module ouvre la zone détaillée du plan", () => {
  it("hôtel : stock → cuisine, chambres → chambres, commandes → restaurant, dépenses → bureau", () => {
    expect(zoneForEntity("hotel", { key: "produits", labelPlural: "Produits & Stocks" })).toBe("cuisine");
    expect(zoneForEntity("hotel", { key: "chambres", labelPlural: "Chambres" })).toBe("chambres");
    expect(zoneForEntity("hotel", { key: "reservations", labelPlural: "Réservations" })).toBe("reception");
    expect(zoneForEntity("hotel", { key: "commandes", labelPlural: "Commandes" })).toBe("restaurant");
    expect(zoneForEntity("hotel", { key: "depenses", labelPlural: "Dépenses" })).toBe("bureau");
  });
  it("restaurant et garage", () => {
    expect(zoneForEntity("restaurant", { key: "produits", labelPlural: "Produits & Stocks" })).toBe("stock");
    expect(zoneForEntity("restaurant", { key: "commandes", labelPlural: "Commandes" })).toBe("cuisine");
    expect(zoneForEntity("garage", { key: "reparations", labelPlural: "Réparations" })).toBe("atelier");
    expect(zoneForEntity("garage", { key: "produits", labelPlural: "Pièces" })).toBe("stock");
    expect(zoneForEntity("garage", { key: "clients", labelPlural: "Clients" })).toBe("accueil");
  });
});
