import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminAudit, assertAdminApi } from "@/lib/admin";
import { encryptionAvailable, encryptSecret } from "@/lib/crypto";
import { getSetting, setSetting } from "@/lib/settings";
import { refreshAiSettings } from "@/lib/ai";

const provider = z.enum(["openai", "anthropic", "gemini"]);

/** Enregistre une clé API chiffrée côté serveur ; elle n'est plus jamais renvoyée au navigateur. */
export const PUT = route(async (req) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const input = z.object({ provider, key: z.string().trim().min(16, "Clé trop courte.").max(300).regex(/^[\x21-\x7e]+$/, "Clé invalide.") }).parse(await readJson(req));
  if (!encryptionAvailable()) throw new HttpError(409, "Chiffrement indisponible : ajoutez APP_ENCRYPTION_KEY dans les variables du serveur.");
  const s = await getSetting("ai");
  s.keys[input.provider] = { enc: encryptSecret(input.key), last4: input.key.slice(-4), savedAt: new Date().toISOString() };
  await setSetting("ai", s, admin.id);
  await refreshAiSettings(true);
  await adminAudit(admin, "ai_key_saved", { provider: input.provider, last4: input.key.slice(-4) });
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (req) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const input = z.object({ provider }).parse(await readJson(req));
  const s = await getSetting("ai");
  delete s.keys[input.provider];
  await setSetting("ai", s, admin.id);
  await refreshAiSettings(true);
  await adminAudit(admin, "ai_key_deleted", { provider: input.provider });
  return NextResponse.json({ ok: true });
});
