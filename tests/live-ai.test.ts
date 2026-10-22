import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Test réel du fournisseur IA configuré (désactivé par défaut, consomme du quota).
 * Lancement : AI_LIVE_TEST=1 AI_PROVIDER=gemini GEMINI_API_KEY=… npx vitest run tests/live-ai.test.ts
 */
describe.skipIf(!process.env.AI_LIVE_TEST)("fournisseur IA réel", () => {
  it("analyse un vrai problème d'entreprise", { timeout: 180_000 }, async () => {
    const { aiConfig, aiDiagnose } = await import("@/lib/ai");
    expect(aiConfig()).not.toBeNull();
    const t0 = Date.now();
    const { diagnosis, usage } = await aiDiagnose({ problem: "Je tiens une pharmacie à Bangui. Des médicaments périmés restent en rayon et je découvre les ruptures trop tard. Mes deux vendeurs notent les ventes sur un cahier." });
    console.log(JSON.stringify({ secondes: (Date.now() - t0) / 1000, usage, secteur: diagnosis.sectorLabel, probleme: diagnosis.mainProblem, causes: diagnosis.causes, solutions: diagnosis.solutions, fonctionnalites: diagnosis.features.map((f) => `${f.selected ? "[x]" : "[ ]"} ${f.title} (${f.entity?.fields.length ?? 0} champs)`), questions: diagnosis.questions }, null, 2));
    expect(diagnosis.source).toBe("ai");
    expect(diagnosis.features.length).toBeGreaterThan(0);
  });
});
