import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { assertSameOrigin, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { hashToken } from "@/lib/tokens";
import { INVITE_DAYS, invitationState } from "@/lib/team";
import { inviteLink, projectPositions, projectSector, sendInviteEmail, teamActor } from "@/lib/team-server";

type Ctx = { params: Promise<{ id: string; invId: string }> };

/** Renvoyer une invitation : nouveau lien (l'ancien ne fonctionne plus), 7 jours de plus, nouvel e-mail. */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id, invId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(invId)) throw new HttpError(404, "Invitation introuvable.");
  const { profile, project } = await getAccess(id);
  await teamActor(id, profile.id);
  const db = adminClient();
  const { data: inv } = await db.from("invitations").select("*").eq("id", invId).eq("project_id", id).maybeSingle();
  if (!inv) throw new HttpError(404, "Invitation introuvable.");
  const state = invitationState(inv);
  if (state === "acceptee") throw new HttpError(409, "Invitation déjà acceptée.");
  if (state === "annulee") throw new HttpError(409, "Invitation annulée : créez-en une nouvelle.");
  const token = randomBytes(32).toString("base64url");
  await db.from("invitations").update({ token_hash: hashToken(token), expires_at: new Date(Date.now() + INVITE_DAYS * 86400000).toISOString(), sent_count: (inv.sent_count ?? 1) + 1, last_sent_at: new Date().toISOString() }).eq("id", invId);
  const label = (await projectPositions(id, projectSector(project))).find((p) => p.key === inv.position)?.label ?? inv.position ?? "";
  const mail = await sendInviteEmail(inv.email, token, { company: project.name, position: label, fullName: inv.full_name ?? "" });
  await db.from("invitations").update({ email_status: mail.status }).eq("id", invId);
  await audit("member.invitation_resent", { projectId: id, actorId: profile.id, details: { invitationId: invId, email: mail.status } });
  return NextResponse.json({ link: inviteLink(token), email: mail.status, expiresInDays: INVITE_DAYS });
});
