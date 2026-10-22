import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { adminAudit, assertAdminApi } from "@/lib/admin";

/** Rôle d'un membre dans un logiciel (le propriétaire du logiciel ne peut pas être modifié ici). */
export const PATCH = route(async (req) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const input = z.object({ projectId: z.string().uuid(), userId: z.string().uuid(), role: z.enum(["admin", "manager", "employee", "viewer"]) }).parse(await readJson(req));
  const db = adminClient();
  const { data: m } = await db.from("project_members").select("role").eq("project_id", input.projectId).eq("user_id", input.userId).maybeSingle();
  if (!m) throw new HttpError(404, "Membre introuvable.");
  if (m.role === "owner") throw new HttpError(400, "Le rôle du propriétaire d'un logiciel ne peut pas être changé.");
  await db.from("project_members").update({ role: input.role }).eq("project_id", input.projectId).eq("user_id", input.userId);
  await adminAudit(admin, "member_role_changed", { userId: input.userId, from: m.role, to: input.role }, input.projectId);
  return NextResponse.json({ ok: true });
});
