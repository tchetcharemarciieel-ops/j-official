import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { assertAdminApi } from "@/lib/admin";
import { aiProviderKey, refreshAiSettings } from "@/lib/ai";

/** Modèles réellement proposés par le fournisseur pour la clé configurée (appel en direct). */
export const GET = route(async (req) => {
  await assertAdminApi();
  const provider = z.enum(["openai", "anthropic", "gemini"]).parse(new URL(req.url).searchParams.get("provider"));
  await refreshAiSettings();
  const key = aiProviderKey(provider);
  if (!key) throw new HttpError(409, "Aucune clé n'est configurée pour ce fournisseur.");
  const signal = AbortSignal.timeout(15_000);
  let models: string[] = [];
  try {
    if (provider === "gemini") {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key }, signal });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      models = (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
    } else if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` }, signal });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { data?: { id: string }[] };
      models = (j.data ?? []).map((m) => m.id).filter((id) => /^(gpt|o\d)/.test(id));
    } else {
      const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { data?: { id: string }[] };
      models = (j.data ?? []).map((m) => m.id);
    }
  } catch (e) {
    const status = e instanceof Error ? e.message : "";
    throw new HttpError(502, status === "401" || status === "403" || status === "400" ? "Clé refusée par le fournisseur." : "Le fournisseur n'a pas répondu.");
  }
  return NextResponse.json({ models: models.sort() });
});
