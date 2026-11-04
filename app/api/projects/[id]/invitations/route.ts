import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { hashToken } from "@/lib/tokens";
import { canAssign, INVITE_DAYS, SECTOR_PERMISSIONS } from "@/lib/team";
import { inviteLink, projectPositions, projectSector, seatInfo, sendInviteEmail, teamActor } from "@/lib/team-server";

type Ctx = { params: Promise<{ id: string }> };

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, "Indiquez le nom complet.").max(80),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide."),
  phone: z.string().trim().max(30).default(""),
  position: z.string().trim().min(2, "Choisissez le poste.").max(40),
  permissions: z.array(z.string().max(40)).max(30).optional(),
  // Ancien formulaire (rôle seul) : toujours accepté.
  role: z.enum(["admin", "manager", "employee", "viewer"]).optional(),
});

/**
 * Invitation sécurisée : jeton aléatoire de 256 bits stocké uniquement sous forme de hachage,
 * valable 7 jours, à usage unique et réservé à l'adresse e-mail invitée. Le poste et les
 * permissions proposés sont vérifiés ici (aucune permission au-delà de celles de l'invitant).
 */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id);
  const actor = await teamActor(id, profile.id);
  const input = inviteSchema.parse(await readJson(req));
  const sector = projectSector(project);
  const pos = (await projectPositions(id, sector)).find((p) => p.key === input.position);
  if (!pos) throw new HttpError(422, "Poste inconnu : choisissez un poste de la liste ou créez-le.");
  const allowed = new Set<string>(SECTOR_PERMISSIONS[sector]);
  const permissions = (input.permissions ?? pos.permissions).filter((p) => allowed.has(p));
  const check = canAssign({ ...actor, id: profile.id }, { id: null, role: null }, { role: pos.role, permissions });
  if (!check.ok) throw new HttpError(403, check.reason);
  const db = adminClient();
  const { data: owner } = await db.from("profiles").select("email").eq("id", project.owner_id).single();
  if (owner?.email?.toLowerCase() === input.email) throw new HttpError(409, "Cette adresse est celle du propriétaire.");
  const { data: existing } = await db.from("profiles").select("id").ilike("email", input.email).maybeSingle();
  if (existing) {
    const { data: m } = await db.from("project_members").select("user_id").eq("project_id", id).eq("user_id", existing.id).maybeSingle();
    if (m) throw new HttpError(409, "Cette personne fait déjà partie de l'équipe : modifiez son poste dans la liste.");
  }
  // Une nouvelle invitation remplace l'ancienne pour la même adresse (la place n'est comptée qu'une fois).
  await db.from("invitations").update({ revoked_at: new Date().toISOString(), revoked_by: profile.id }).eq("project_id", id).eq("email", input.email).is("accepted_at", null).is("revoked_at", null);
  const seat = await seatInfo(project);
  if (!seat.unlimited && !profile.is_admin && seat.full) throw new HttpError(402, `Toutes les places sont utilisées (${seat.used} membre(s) et ${seat.pending} invitation(s) en attente sur ${seat.total}). Demandez un accès supplémentaire.`);
  const token = randomBytes(32).toString("base64url");
  const { data: inv, error } = await db
    .from("invitations")
    .insert({ project_id: id, email: input.email, role: pos.role, full_name: input.fullName, phone: input.phone, position: pos.key, permissions, token_hash: hashToken(token), created_by: profile.id, expires_at: new Date(Date.now() + INVITE_DAYS * 86400000).toISOString(), email_status: "lien" })
    .select("id")
    .single();
  if (error || !inv) throw new HttpError(500, "Invitation impossible.");
  const mail = await sendInviteEmail(input.email, token, { company: project.name, position: pos.label, fullName: input.fullName });
  await db.from("invitations").update({ email_status: mail.status }).eq("id", inv.id);
  await audit("member.invited", { projectId: id, actorId: profile.id, details: { email: input.email, position: pos.key, role: pos.role, permissions, emailStatus: mail.status } });
  return NextResponse.json({ link: inviteLink(token), appName: project.name, expiresInDays: INVITE_DAYS, email: mail.status, emailError: mail.status === "echec" ? "L'e-mail n'a pas pu partir : envoyez le lien par WhatsApp ou SMS." : null });
});

/** Annulation d'une invitation (elle reste dans l'historique). */
export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile } = await getAccess(id);
  await teamActor(id, profile.id);
  const { invitationId } = z.object({ invitationId: z.string().uuid() }).parse(await readJson(req));
  await adminClient().from("invitations").update({ revoked_at: new Date().toISOString(), revoked_by: profile.id }).eq("id", invitationId).eq("project_id", id).is("accepted_at", null);
  await audit("member.invitation_revoked", { projectId: id, actorId: profile.id, details: { invitationId } });
  return NextResponse.json({ ok: true });
});
