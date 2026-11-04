import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { canAssign, SECTOR_PERMISSIONS, type MemberRow } from "@/lib/team";
import { projectPositions, projectSector, teamActor } from "@/lib/team-server";
import type { Role } from "@/lib/spec";

type Ctx = { params: Promise<{ id: string; userId: string }> };

async function target(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new HttpError(404, "Membre introuvable.");
  const { data } = await adminClient().from("project_members").select("*").eq("project_id", id).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(404, "Membre introuvable.");
  if (data.role === "owner") throw new HttpError(403, "Le propriétaire ne peut pas être modifié ni retiré.");
  return data as MemberRow & { position: string; permissions: string[]; status: string; display_name: string; phone: string };
}

const patchSchema = z.object({
  position: z.string().trim().min(2).max(40).optional(),
  permissions: z.array(z.string().max(40)).max(30).optional(),
  displayName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  // Ancien écran : changement de rôle seul.
  role: z.enum(["admin", "manager", "employee", "viewer"]).optional(),
});

/**
 * Modifier un membre : poste, permissions, coordonnées, suspension ou réactivation. Personne ne
 * peut modifier son propre accès ; seul le propriétaire gère les administrateurs ; un responsable
 * ne donne jamais plus que ce qu'il a. La suspension prend effet à la requête suivante du membre.
 */
export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id, userId } = await params;
  const { profile, project } = await getAccess(id);
  const actor = await teamActor(id, profile.id);
  const input = patchSchema.parse(await readJson(req));
  const cur = await target(id, userId);
  const sector = projectSector(project);
  let role: Role = cur.role;
  let position = cur.position ?? "";
  let permissions = cur.permissions ?? [];
  if (input.position) {
    const pos = (await projectPositions(id, sector)).find((p) => p.key === input.position);
    if (!pos) throw new HttpError(422, "Poste inconnu.");
    role = pos.role;
    position = pos.key;
    permissions = input.permissions ?? pos.permissions;
  } else if (input.permissions) permissions = input.permissions;
  if (input.role && !input.position) role = input.role;
  const allowed = new Set<string>(SECTOR_PERMISSIONS[sector]);
  permissions = permissions.filter((p) => allowed.has(p));
  const check = canAssign({ ...actor, id: profile.id }, { id: userId, role: cur.role }, { role, permissions });
  if (!check.ok) throw new HttpError(403, check.reason);
  const patch: Record<string, unknown> = { role, position, permissions, updated_at: new Date().toISOString() };
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.status && input.status !== cur.status) {
    patch.status = input.status;
    patch.suspended_at = input.status === "suspended" ? new Date().toISOString() : null;
    patch.suspended_by = input.status === "suspended" ? profile.id : null;
  }
  const { error } = await adminClient().from("project_members").update(patch).eq("project_id", id).eq("user_id", userId);
  if (error) throw new HttpError(500, "Modification impossible.");
  const event = input.status && input.status !== cur.status ? (input.status === "suspended" ? "member.suspended" : "member.reactivated") : "member.updated";
  await audit(event, { projectId: id, actorId: profile.id, level: event === "member.suspended" ? "warning" : "info", details: { userId, from: { role: cur.role, position: cur.position, permissions: cur.permissions }, to: { role, position, permissions } } });
  return NextResponse.json({ ok: true });
});

/** Retirer un membre : son accès est supprimé immédiatement (ses actions passées restent dans l'historique). */
export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id, userId } = await params;
  const { profile } = await getAccess(id);
  const actor = await teamActor(id, profile.id);
  const cur = await target(id, userId);
  const check = canAssign({ ...actor, id: profile.id }, { id: userId, role: cur.role }, { role: "viewer", permissions: [] });
  if (!check.ok) throw new HttpError(403, check.reason);
  await adminClient().from("project_members").delete().eq("project_id", id).eq("user_id", userId);
  await audit("member.revoked", { projectId: id, actorId: profile.id, level: "warning", details: { userId, role: cur.role, position: cur.position } });
  return NextResponse.json({ ok: true });
});
