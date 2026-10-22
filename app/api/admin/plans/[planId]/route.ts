import { NextResponse } from "next/server";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { adminAudit, assertAdminApi } from "@/lib/admin";
import { planFields } from "@/lib/plan-schema";

type Ctx = { params: Promise<{ planId: string }> };

/** Modification d'une formule (l'identifiant ne change pas : les abonnés y restent rattachés). */
export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const { planId } = await params;
  const input = planFields.partial().parse(await readJson(req));
  const { data, error } = await adminClient().from("plans").update(input).eq("id", planId).select("id");
  if (error || !data?.length) throw new HttpError(404, "Formule introuvable.");
  await adminAudit(admin, "plan_updated", { planId, ...input });
  return NextResponse.json({ ok: true });
});
