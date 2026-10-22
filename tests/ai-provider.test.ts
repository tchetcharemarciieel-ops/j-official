import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const KEY = "test-cle-factice";
const ENV = ["AI_PROVIDER", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "AI_MODEL", "OPENAI_BASE_URL", "GEMINI_BASE_URL"];

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const validDiagnosis = {
  businessName: "Pharmacie du Centre",
  sector: "pharmacie",
  sectorLabel: "Pharmacie",
  mainProblem: "Des médicaments périmés restent en rayon.",
  causes: ["Les dates de péremption sont notées sur papier."],
  solutions: ["Suivre chaque lot avec sa date de péremption."],
  manualTasks: ["Inventaire mensuel à la main"],
  dataToKeep: ["Médicaments"],
  users: "La pharmacienne et deux vendeurs",
  automations: ["Alerte de péremption"],
  limits: [],
  questions: [],
  features: [
    {
      id: "medicaments",
      title: "Médicaments",
      description: "Stock par lot",
      selected: true,
      entity: {
        key: "medicaments",
        label: "Médicament",
        labelPlural: "Médicaments",
        icon: "💊",
        description: "",
        fields: [
          { key: "nom", label: "Nom", type: "text", required: true, options: [], relation: "", showInTable: true },
          { key: "peremption", label: "Date de péremption", type: "date", required: false, options: [], relation: "", showInTable: true },
        ],
        permissions: [],
      },
      widgets: [{ type: "count", label: "Médicaments", entity: "medicaments", field: "", dateField: "", threshold: 0 }],
    },
  ],
};

describe("fournisseur IA", () => {
  beforeEach(() => {
    for (const k of ENV) delete process.env[k];
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("n'active l'IA que si une clé est présente", async () => {
    const { aiConfig } = await import("@/lib/ai");
    expect(aiConfig()).toBeNull();
    process.env.AI_PROVIDER = "anthropic";
    process.env.OPENAI_API_KEY = KEY;
    expect(aiConfig()).toBeNull(); // fournisseur demandé sans sa clé
    delete process.env.AI_PROVIDER;
    expect(aiConfig()).toMatchObject({ provider: "openai", model: "gpt-5-mini" });
  });

  it("envoie un schéma strict et renvoie un diagnostic IA avec causes et solutions", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = KEY;
    const fetchMock = mockFetch(200, {
      model: "gpt-5-mini-2025-08-07",
      usage: { prompt_tokens: 1200, completion_tokens: 800 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(validDiagnosis), refusal: null } }],
    });
    const { aiDiagnose } = await import("@/lib/ai");
    const { diagnosis, usage } = await aiDiagnose({ problem: "Ma pharmacie a des médicaments périmés." });
    expect(diagnosis.source).toBe("ai");
    expect(diagnosis.causes).toHaveLength(1);
    expect(diagnosis.solutions[0]).toContain("péremption");
    expect(usage.model).toBe("gpt-5-mini-2025-08-07");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    const sent = JSON.parse(String(init.body));
    expect(sent.response_format.json_schema.strict).toBe(true);
    // Mode strict OpenAI : chaque objet liste toutes ses propriétés et interdit les autres.
    const check = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
      }
      Object.values(n).forEach(check);
    };
    check(sent.response_format.json_schema.schema);
    expect(JSON.stringify(diagnosis)).not.toContain(KEY);
  });

  it("traduit une clé refusée en erreur claire, sans divulguer la clé", async () => {
    process.env.OPENAI_API_KEY = KEY;
    mockFetch(401, { error: { message: `Incorrect API key provided: ${KEY}`, code: "invalid_api_key" } });
    const { aiDiagnose } = await import("@/lib/ai");
    const err = await aiDiagnose({ problem: "Gérer mon stock" }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("clé API OpenAI est refusée");
    expect((err as Error).message).not.toContain(KEY);
  });

  it("rejette une réponse mal formée", async () => {
    process.env.OPENAI_API_KEY = KEY;
    mockFetch(200, { choices: [{ finish_reason: "stop", message: { content: "{\"businessName\": 3}" } }] });
    const { aiDiagnose } = await import("@/lib/ai");
    await expect(aiDiagnose({ problem: "Gérer mon stock" })).rejects.toThrow("mal formée");
  });

  it("Gemini : clé en en-tête, schéma JSON et diagnostic IA", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = KEY;
    const fetchMock = mockFetch(200, {
      modelVersion: "gemini-3.8-flash",
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 700, thoughtsTokenCount: 300 },
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(validDiagnosis) }] } }],
    });
    const { aiConfig, aiDiagnose } = await import("@/lib/ai");
    expect(aiConfig()).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash", label: "Google Gemini" });
    const { diagnosis, usage } = await aiDiagnose({ problem: "Ma pharmacie a des médicaments périmés." });
    expect(diagnosis.source).toBe("ai");
    expect(diagnosis.causes.length).toBeGreaterThan(0);
    expect(usage.outputTokens).toBe(1000);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const sent = JSON.parse(String(init.body));
    expect(sent.generationConfig.responseMimeType).toBe("application/json");
    expect(sent.generationConfig.responseJsonSchema.type).toBe("object");
  });

  it("Gemini : clé invalide signalée clairement", async () => {
    process.env.GEMINI_API_KEY = KEY;
    mockFetch(400, { error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } });
    const { aiDiagnose } = await import("@/lib/ai");
    await expect(aiDiagnose({ problem: "Gérer mon stock" })).rejects.toThrow("clé API Google Gemini est refusée");
  });
});
