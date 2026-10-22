import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { adminAudit, assertAdminApi } from "@/lib/admin";
import { setSetting } from "@/lib/settings";
import { SETTINGS } from "@/lib/settings-schema";

const EDITABLE = ["branding", "home", "announcement", "contact", "faq", "templates"] as const;

/** Personnalisation de la plateforme (les réglages IA ont leur propre route). */
export const PUT = route(async (req) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const { key, value } = z.object({ key: z.enum(EDITABLE), value: z.unknown() }).parse(await readJson(req));
  const parsed = SETTINGS[key].parse(value);
  await setSetting(key, parsed as never, admin.id);
  await adminAudit(admin, "settings_updated", { key });
  return NextResponse.json({ ok: true });
});
