import "server-only";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { HttpError, draftSpec, publishedSpec, type ProjectRow } from "./access";
import { SITE_URL } from "./config";
import { adminClient } from "./supabase/admin";
import { effectiveWorkspace } from "./workspace";
import { canManageTeam, invitationState, positionsFor, seats, sectorOf, type MemberRow, type Position, type Sector } from "./team";
import type { Role } from "./spec";

export type MemberFull = MemberRow & { user_id: string; display_name?: string; phone?: string; created_at: string; suspended_at?: string | null };

/** Membre qui agit, avec son poste : refuse si l'accès ne permet pas de gérer l'équipe. */
export async function teamActor(projectId: string, userId: string): Promise<MemberFull> {
  const { data } = await adminClient().from("project_members").select("*").eq("project_id", projectId).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(404, "Projet introuvable.");
  if (!canManageTeam(data as MemberRow)) throw new HttpError(403, "Votre accès ne permet pas de gérer l'équipe.");
  return data as MemberFull;
}

export function projectSector(project: ProjectRow): Sector {
  const spec = publishedSpec(project) ?? draftSpec(project);
  return sectorOf(spec ? effectiveWorkspace(spec).layout : null);
}

export async function projectPositions(projectId: string, sector: Sector): Promise<Position[]> {
  const { data } = await adminClient().from("project_positions").select("key,label,permissions").eq("project_id", projectId).order("created_at");
  return positionsFor(sector, (data ?? []) as { key: string; label: string; permissions: string[] }[]);
}

/** Places du logiciel : formule du propriétaire + accès supplémentaires accordés. */
export async function seatInfo(project: ProjectRow) {
  const db = adminClient();
  const [{ data: owner }, { count: members }, { data: invs }] = await Promise.all([
    db.from("profiles").select("plan,is_admin").eq("id", project.owner_id).single(),
    db.from("project_members").select("user_id", { count: "exact", head: true }).eq("project_id", project.id),
    db.from("invitations").select("accepted_at,revoked_at,expires_at").eq("project_id", project.id).is("accepted_at", null).is("revoked_at", null),
  ]);
  const { data: plan } = await db.from("plans").select("max_members,name").eq("id", owner?.plan ?? "free").maybeSingle();
  const pending = (invs ?? []).filter((i) => invitationState(i as never) === "en_attente").length;
  const extra = Number((project as ProjectRow & { extra_seats?: number }).extra_seats ?? 0);
  return { ...seats(plan?.max_members ?? 1, extra, members ?? 0, pending), plan: plan?.name ?? "", unlimited: Boolean(owner?.is_admin) };
}

/**
 * Envoie l'invitation par e-mail avec le service d'e-mails déjà configuré dans Supabase (SMTP) :
 * - nouvelle adresse : e-mail « invitation » (création du compte, puis choix du mot de passe) ;
 * - compte existant : lien de connexion vers l'invitation.
 * Le lien mène toujours à la page d'invitation ; aucun mot de passe n'est jamais envoyé.
 */
export async function sendInviteEmail(email: string, token: string, meta: { company: string; position: string; fullName: string }): Promise<{ status: "envoye" | "echec"; detail?: string }> {
  const back = (fresh: boolean) => `${SITE_URL}/auth/invitation?next=${encodeURIComponent(`/invitation/${token}${fresh ? "?nouveau=1" : ""}`)}`;
  const data = { full_name: meta.fullName, company: meta.company, position: meta.position, invitation: "1" };
  try {
    const { error } = await adminClient().auth.admin.inviteUserByEmail(email, { redirectTo: back(true), data });
    if (!error) return { status: "envoye" };
    if (!/already|registered|exists/i.test(error.message)) return { status: "echec", detail: error.message };
    // Compte existant : lien de connexion (sans création de compte).
    const anon = createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" } });
    const r = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: back(false) } });
    return r.error ? { status: "echec", detail: r.error.message } : { status: "envoye" };
  } catch (e) {
    return { status: "echec", detail: e instanceof Error ? e.message : "Service d'e-mail injoignable" };
  }
}

export const inviteLink = (token: string) => `${SITE_URL}/invitation/${token}`;
export type { Role };
