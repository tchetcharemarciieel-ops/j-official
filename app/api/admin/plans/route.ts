import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { adminAudit, assertAdminApi } from "@/lib/admin";
import { planFields } from "@/lib/plan-schema";

/** Création d'une formule tarifaire. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const input = planFields.extend({ id: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{1,29}$/, "Identifiant : lettres minuscules, chiffres, - ou _.") }).parse(await readJson(req));
  const { error } = await adminClient().from("plans").insert(input);
  if (error) throw new HttpError(409, /duplicate/i.test(error.message) ? "Une formule existe déjà avec cet identifiant." : "Création impossible.");
  await adminAudit(admin, "plan_created", input);
  return NextResponse.json({ ok: true });
});
