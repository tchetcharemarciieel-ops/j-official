import { NextResponse } from "next/server";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { adminAudit, assertAdminApi } from "@/lib/admin";
import { getSetting, setSetting } from "@/lib/settings";
import { SETTINGS } from "@/lib/settings-schema";
import { refreshAiSettings } from "@/lib/ai";

const body = SETTINGS.ai.omit({ keys: true });

/** Activation, fournisseur, modèle, modèles de secours et quotas (les clés ont leur propre route). */
export const PUT = route(async (req) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const input = body.parse(await readJson(req));
  const current = await getSetting("ai");
  await setSetting("ai", { ...current, ...input }, admin.id);
  await refreshAiSettings(true);
  await adminAudit(admin, "ai_settings_updated", input);
  return NextResponse.json({ ok: true });
});
