import { NextResponse } from "next/server";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { appPrefsSchema } from "@/lib/app-prefs";

type Ctx = { params: Promise<{ id: string }> };

/** Préférences de l'utilisateur connecté pour ce logiciel (jamais celles d'un autre compte). */
export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const { profile } = await getAccess(id);
  const { data } = await adminClient().from("user_app_prefs").select("prefs").eq("user_id", profile.id).eq("project_id", id).maybeSingle();
  const parsed = appPrefsSchema.safeParse(data?.prefs ?? {});
  return NextResponse.json({ prefs: parsed.success ? parsed.data : {} });
});

export const PUT = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile } = await getAccess(id);
  const prefs = appPrefsSchema.parse(await readJson(req));
  const { error } = await adminClient()
    .from("user_app_prefs")
    .upsert({ user_id: profile.id, project_id: id, prefs, updated_at: new Date().toISOString() }, { onConflict: "user_id,project_id" });
  if (error) throw new HttpError(500, "Préférences non enregistrées.");
  return NextResponse.json({ prefs });
});
