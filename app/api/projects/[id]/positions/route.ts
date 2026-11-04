import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { POSITIONS, SECTOR_PERMISSIONS, positionKey } from "@/lib/team";
import { projectSector, teamActor } from "@/lib/team-server";

type Ctx = { params: Promise<{ id: string }> };

/** Postes personnalisés (réservés au propriétaire et aux administrateurs). */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project, role } = await getAccess(id);
  await teamActor(id, profile.id);
  if (role !== "owner" && role !== "admin") throw new HttpError(403, "Seuls le propriétaire et les administrateurs créent des postes.");
  const input = z.object({ label: z.string().trim().min(2, "Nom du poste trop court.").max(60), permissions: z.array(z.string().max(40)).min(1, "Choisissez au moins une autorisation.").max(30) }).parse(await readJson(req));
  const sector = projectSector(project);
  const allowed = new Set<string>(SECTOR_PERMISSIONS[sector]);
  // « Gestion des équipes » ne peut pas être donnée par un poste personnalisé (réservée aux administrateurs et responsables).
  const permissions = input.permissions.filter((p) => allowed.has(p) && p !== "equipe");
  const key = `perso_${positionKey(input.label)}`.slice(0, 40);
  if (POSITIONS[sector].some((p) => p.key === key)) throw new HttpError(409, "Ce poste existe déjà.");
  const { error } = await adminClient().from("project_positions").upsert({ project_id: id, key, label: input.label, permissions, created_by: profile.id }, { onConflict: "project_id,key" });
  if (error) throw new HttpError(500, "Création du poste impossible.");
  await audit("position.saved", { projectId: id, actorId: profile.id, details: { key, permissions } });
  return NextResponse.json({ ok: true, key });
});

export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, role } = await getAccess(id);
  await teamActor(id, profile.id);
  if (role !== "owner" && role !== "admin") throw new HttpError(403, "Seuls le propriétaire et les administrateurs suppriment des postes.");
  const { key } = z.object({ key: z.string().regex(/^perso_[a-z0-9_]{1,40}$/) }).parse(await readJson(req));
  const db = adminClient();
  const { count } = await db.from("project_members").select("user_id", { count: "exact", head: true }).eq("project_id", id).eq("position", key);
  if (count) throw new HttpError(409, `${count} membre(s) occupent ce poste : changez d'abord leur poste.`);
  await db.from("project_positions").delete().eq("project_id", id).eq("key", key);
  await audit("position.deleted", { projectId: id, actorId: profile.id, details: { key } });
  return NextResponse.json({ ok: true });
});
