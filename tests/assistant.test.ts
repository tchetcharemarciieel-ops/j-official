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
