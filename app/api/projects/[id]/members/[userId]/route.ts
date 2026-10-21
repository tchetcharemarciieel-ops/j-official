import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; userId: string }> };

async function target(id: string, userId: string) {
  const { data } = await adminClient().from("project_members").select("role").eq("project_id", id).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(404, "Membre introuvable.");
  if (data.role === "owner") throw new HttpError(403, "Le propriétaire ne peut pas être modifié ni retiré.");
  return data.role as string;
}

export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id, userId } = await params;
  const { profile, role } = await getAccess(id, ["owner", "admin"]);
  const { role: newRole } = z.object({ role: z.enum(["admin", "manager", "employee", "viewer"]) }).parse(await readJson(req));
  const current = await target(id, userId);
  if ((newRole === "admin" || current === "admin") && role !== "owner") throw new HttpError(403, "Seul le propriétaire gère les administrateurs.");
  await adminClient().from("project_members").update({ role: newRole }).eq("project_id", id).eq("user_id", userId);
  await audit("member.role_changed", { projectId: id, actorId: profile.id, details: { userId, from: current, to: newRole } });
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id, userId } = await params;
  const { profile, role } = await getAccess(id, ["owner", "admin"]);
  const current = await target(id, userId);
  if (current === "admin" && role !== "owner") throw new HttpError(403, "Seul le propriétaire peut retirer un administrateur.");
  await adminClient().from("project_members").delete().eq("project_id", id).eq("user_id", userId);
  await audit("member.revoked", { projectId: id, actorId: profile.id, level: "warning", details: { userId, role: current } });
  return NextResponse.json({ ok: true });
});
