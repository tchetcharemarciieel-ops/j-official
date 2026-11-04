import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { hashToken } from "@/lib/tokens";
import { notifyProject } from "@/lib/notify";
import { invitationState } from "@/lib/team";

/**
 * Acceptation d'une invitation : par le lien secret (jeton) ou, pour la personne connectée avec
 * l'adresse invitée, depuis la liste de ses invitations. Le poste et les permissions viennent
 * uniquement de l'invitation (jamais du navigateur). Usage unique, expiration vérifiée.
 */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connectez-vous pour accepter l'invitation.");
  const input = z.union([z.object({ token: z.string().min(20).max(100) }), z.object({ invitationId: z.string().uuid() })]).parse(await readJson(req));
  const db = adminClient();
  const q = db.from("invitations").select("*");
  const { data: inv } = await ("token" in input ? q.eq("token_hash", hashToken(input.token)) : q.eq("id", input.invitationId)).maybeSingle();
  if (!inv) throw new HttpError(404, "Invitation invalide ou déjà utilisée.");
  const state = invitationState(inv);
  if (state === "acceptee" || state === "annulee") throw new HttpError(404, "Invitation invalide ou déjà utilisée.");
  if (state === "expiree") throw new HttpError(410, "Invitation expirée. Demandez à votre responsable de vous la renvoyer.");
  if (inv.email !== profile.email.toLowerCase()) throw new HttpError(403, `Cette invitation est destinée à ${inv.email}. Connectez-vous avec cette adresse.`);
  // Usage unique : seule la première acceptation passe (mise à jour conditionnelle).
  const { data: claimed } = await db.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id).is("accepted_at", null).is("revoked_at", null).select("id").maybeSingle();
  if (!claimed) throw new HttpError(404, "Invitation invalide ou déjà utilisée.");
  const fields = { role: inv.role, position: inv.position ?? "", permissions: inv.permissions ?? [], display_name: inv.full_name ?? "", phone: inv.phone ?? "", status: "active", updated_at: new Date().toISOString() };
  const { data: existing } = await db.from("project_members").select("role").eq("project_id", inv.project_id).eq("user_id", profile.id).maybeSingle();
  if (existing?.role === "owner") throw new HttpError(409, "Vous êtes déjà propriétaire de ce logiciel.");
  if (existing) await db.from("project_members").update(fields).eq("project_id", inv.project_id).eq("user_id", profile.id);
  else await db.from("project_members").insert({ project_id: inv.project_id, user_id: profile.id, invited_by: inv.created_by, ...fields });
  await audit("member.joined", { projectId: inv.project_id, actorId: profile.id, details: { role: inv.role, position: inv.position } });
  if (!existing) await notifyProject(inv.project_id, { type: "team", title: `${inv.full_name || profile.full_name || profile.email} a rejoint votre logiciel`, body: `Poste : ${inv.position || inv.role}`, link: `/projets/${inv.project_id}?onglet=equipe`, exceptUserId: profile.id });
  const { data: project } = await db.from("projects").select("slug").eq("id", inv.project_id).single();
  return NextResponse.json({ slug: project?.slug, projectId: inv.project_id });
});
