import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { chatBody } from "@/lib/assistant-schema";
import { CLIENT_ASSISTANT, OWNER_ASSISTANT } from "@/lib/assistant";

describe("MiniSoft RCA Assistant", () => {
  it("n'accepte qu'une conversation se terminant par l'utilisateur", () => {
    expect(chatBody.safeParse({ messages: [{ role: "user", text: "Bonjour" }] }).success).toBe(true);
    expect(chatBody.safeParse({ messages: [{ role: "user", text: "a" }, { role: "assistant", text: "b" }] }).success).toBe(false);
    expect(chatBody.safeParse({ messages: [] }).success).toBe(false);
  });
  it("interdit d'affirmer une action ou d'inventer des preuves", () => {
    for (const p of [OWNER_ASSISTANT, CLIENT_ASSISTANT]) {
      expect(p).toMatch(/aucun outil d'action/);
      expect(p).toMatch(/N'invente aucun témoignage/);
      expect(p).toMatch(/mot de passe/);
    }
    expect(OWNER_ASSISTANT).toMatch(/7\. Prochaine action concrète/);
    expect(CLIENT_ASSISTANT).toMatch(/Créer ce logiciel/);
  });
});

import { OWNER_AGENTS } from "@/lib/assistant";
describe("agents spécialisés", () => {
  it("chaque agent garde les règles d'honnêteté et son rôle", () => {
    expect(Object.keys(OWNER_AGENTS)).toEqual(["general", "diagnostic", "conception", "qualite", "commercial"]);
    for (const a of Object.values(OWNER_AGENTS)) expect(a.prompt).toMatch(/aucun outil d'action/);
    expect(OWNER_AGENTS.qualite.prompt).toMatch(/jamais comme réussis/);
    expect(OWNER_AGENTS.commercial.prompt).toMatch(/validation du propriétaire/);
  });
});
