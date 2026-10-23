import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

vi.mock("server-only", () => ({}));

describe("administration", () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
    delete process.env.APP_ENCRYPTION_KEY;
    vi.resetModules();
  });

  it("seul le compte listé dans ADMIN_EMAILS est propriétaire", async () => {
    process.env.ADMIN_EMAILS = "Patron@Exemple.cf, second@exemple.cf";
    const { isPlatformOwner } = await import("@/lib/admin");
    expect(isPlatformOwner({ email: "patron@exemple.cf" })).toBe(true);
    expect(isPlatformOwner({ email: "client@exemple.cf" })).toBe(false);
    expect(isPlatformOwner(null)).toBe(false);
    delete process.env.ADMIN_EMAILS;
    expect(isPlatformOwner({ email: "patron@exemple.cf" })).toBe(false);
  });

  it("chiffre les clés API et n'en montre que la fin", async () => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const { encryptSecret, decryptSecret, maskSecret, encryptionAvailable } = await import("@/lib/crypto");
    expect(encryptionAvailable()).toBe(true);
    const blob = encryptSecret("cle-secrete-de-test-1234");
    expect(blob).not.toContain("cle-secrete");
    expect(decryptSecret(blob)).toBe("cle-secrete-de-test-1234");
    expect(decryptSecret(blob.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull();
    expect(maskSecret("cle-secrete-de-test-1234")).toBe("••••••••1234");
  });

  it("sans clé de chiffrement, aucune clé ne peut être enregistrée", async () => {
    const { encryptionAvailable, encryptSecret } = await import("@/lib/crypto");
    expect(encryptionAvailable()).toBe(false);
    expect(() => encryptSecret("x")).toThrow();
  });

  it("graphiques calculés sur les vraies dates", async () => {
    const { weeklyCounts, monthlySums } = await import("@/lib/admin-stats");
    const now = new Date("2026-10-22T12:00:00");
    const w = weeklyCounts(["2026-10-21T10:00:00", "2026-10-20T10:00:00", "2026-01-01T10:00:00"], 12, now);
    expect(w).toHaveLength(12);
    expect(w[11]!.value).toBe(2);
    expect(w.reduce((a, p) => a + p.value, 0)).toBe(2);
    const m = monthlySums([{ at: "2026-10-05T10:00:00", amount: 15000 }, { at: "2026-09-05T10:00:00", amount: 5000 }], 6, now);
    expect(m[5]!.value).toBe(15000);
    expect(m[4]!.value).toBe(5000);
  });

  it("paramètres invalides remplacés par les valeurs par défaut", async () => {
    const { parseSetting } = await import("@/lib/settings-schema");
    expect(parseSetting("branding", { primaryColor: "rouge" }).primaryColor).toBe("#2563eb");
    expect(parseSetting("ai", {}).enabled).toBe(true);
    expect(parseSetting("announcement", { active: true, message: "Maintenance ce soir", level: "maintenance" }).active).toBe(true);
  });
});
