import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { SITE_URL } from "@/lib/config";
import { hashToken } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Invitation sécurisée : jeton aléatoire de 256 bits, stocké uniquement sous forme de hachage,
 * valable 7 jours, à usage unique et réservé à l'adresse e-mail invitée.
 */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project, role } = await getAccess(id, ["owner", "admin"]);
  const input = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(["admin", "manager", "employee", "viewer"]) }).parse(await readJson(req));
  if (input.role === "admin" && role !== "owner") throw new HttpError(403, "Seul le propriétaire peut nommer un administrateur.");
  const db = adminClient();
  const [{ data: plan }, { count }] = await Promise.all([
    db.from("plans").select("max_members,name").eq("id", profile.plan).single(),
    db.from("project_members").select("user_id", { count: "exact", head: true }).eq("project_id", id),
  ]);
  if (!profile.is_admin && plan && (count ?? 0) >= plan.max_members) throw new HttpError(402, `La formule ${plan.name} permet ${plan.max_members} utilisateur(s) par logiciel.`);
  const token = randomBytes(32).toString("base64url");
  await db.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("project_id", id).eq("email", input.email).is("accepted_at", null).is("revoked_at", null);
  const { error } = await db.from("invitations").insert({
    project_id: id,
    email: input.email,
    role: input.role,
    token_hash: hashToken(token),
    created_by: profile.id,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  if (error) throw new HttpError(500, "Invitation impossible.");
  await audit("member.invited", { projectId: id, actorId: profile.id, details: { email: input.email, role: input.role } });
  return NextResponse.json({ link: `${SITE_URL}/invitation/${token}`, appName: project.name, expiresInDays: 7 });
});

export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile } = await getAccess(id, ["owner", "admin"]);
  const { invitationId } = z.object({ invitationId: z.string().uuid() }).parse(await readJson(req));
  await adminClient().from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", invitationId).eq("project_id", id);
  await audit("member.invitation_revoked", { projectId: id, actorId: profile.id, details: { invitationId } });
  return NextResponse.json({ ok: true });
});
