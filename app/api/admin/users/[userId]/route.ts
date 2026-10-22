import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { assertAdminApi } from "@/lib/admin";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ userId: string }> };

export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const { userId } = await params;
  const input = z
    .object({
      plan: z.string().max(40).optional(),
      credits: z.number().int().min(0).max(1_000_000).optional(),
      suspended: z.boolean().optional(),
      reason: z.string().max(300).optional(),
    })
    .parse(await readJson(req));
  if (userId === admin.id && input.suspended) throw new HttpError(400, "Vous ne pouvez pas suspendre votre propre compte.");
  const update: Record<string, unknown> = {};
  if (input.plan !== undefined) update.plan = input.plan;
  if (input.credits !== undefined) update.credits = input.credits;
  if (input.suspended !== undefined) {
    update.suspended = input.suspended;
    update.suspended_reason = input.suspended ? (input.reason ?? "Abus") : null;
  }
  const { error } = await adminClient().from("profiles").update(update).eq("id", userId);
  if (error) throw new HttpError(400, "Mise à jour impossible (formule inconnue ?).");
  await audit("admin.user_updated", { actorId: admin.id, level: input.suspended ? "warning" : "info", details: { userId, ...input } });
  return NextResponse.json({ ok: true });
});
