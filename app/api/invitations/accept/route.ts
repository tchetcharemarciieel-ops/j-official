import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { hashToken } from "@/lib/tokens";
import { notifyProject } from "@/lib/notify";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connectez-vous pour accepter l'invitation.");
  const { token } = z.object({ token: z.string().min(20).max(100) }).parse(await readJson(req));
  const db = adminClient();
  const { data: inv } = await db.from("invitations").select("*").eq("token_hash", hashToken(token)).maybeSingle();
  if (!inv || inv.revoked_at || inv.accepted_at) throw new HttpError(404, "Invitation invalide ou déjà utilisée.");
  if (new Date(inv.expires_at).getTime() < Date.now()) throw new HttpError(410, "Invitation expirée. Demandez-en une nouvelle.");
  if (inv.email !== profile.email.toLowerCase()) throw new HttpError(403, `Cette invitation est destinée à ${inv.email}. Connectez-vous avec cette adresse.`);
  const { data: existing } = await db.from("project_members").select("role").eq("project_id", inv.project_id).eq("user_id", profile.id).maybeSingle();
  if (!existing) await db.from("project_members").insert({ project_id: inv.project_id, user_id: profile.id, role: inv.role, invited_by: inv.created_by });
  await db.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id);
  await audit("member.joined", { projectId: inv.project_id, actorId: profile.id, details: { role: inv.role } });
  if (!existing) await notifyProject(inv.project_id, { type: "team", title: `${profile.full_name || profile.email} a rejoint votre logiciel`, body: `Rôle : ${inv.role}`, link: `/projets/${inv.project_id}?onglet=equipe`, exceptUserId: profile.id });
  const { data: project } = await db.from("projects").select("slug").eq("id", inv.project_id).single();
  return NextResponse.json({ slug: project?.slug, projectId: inv.project_id });
});
