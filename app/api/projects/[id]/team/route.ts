import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { getAccess } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { canManageTeam, effectivePerms, invitationState, SECTOR_PERMISSIONS, type MemberRow } from "@/lib/team";
import { projectPositions, projectSector, seatInfo } from "@/lib/team-server";

type Ctx = { params: Promise<{ id: string }> };

/** Tableau de bord « Gestion des équipes » : membres, invitations (historique), postes et places. */
export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const { profile, project } = await getAccess(id);
  const db = adminClient();
  const { data: me } = await db.from("project_members").select("*").eq("project_id", id).eq("user_id", profile.id).single();
  const manage = canManageTeam(me as MemberRow);
  const sector = projectSector(project);
  const [{ data: rows }, { data: invs }, positions, seat] = await Promise.all([
    db.from("project_members").select("*").eq("project_id", id).order("created_at"),
    manage ? db.from("invitations").select("id,email,full_name,phone,role,position,permissions,email_status,sent_count,last_sent_at,expires_at,accepted_at,revoked_at,created_at,created_by").eq("project_id", id).order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
    projectPositions(id, sector),
    seatInfo(project),
  ]);
  const ids = [...new Set([...(rows ?? []).map((m) => m.user_id), ...((invs ?? []) as { created_by: string }[]).map((i) => i.created_by)])];
  const { data: profiles } = ids.length ? await db.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const who = (uid: string) => (profiles ?? []).find((p) => p.id === uid);
  const members = (rows ?? []).map((m) => ({
    userId: m.user_id as string,
    name: (m.display_name || who(m.user_id)?.full_name || who(m.user_id)?.email?.split("@")[0] || "Membre") as string,
    // Adresse e-mail et téléphone visibles seulement par ceux qui gèrent l'équipe.
    email: manage || m.user_id === profile.id ? (who(m.user_id)?.email ?? "") : "",
    phone: manage ? (m.phone ?? "") : "",
    role: m.role as string,
    position: (m.position ?? "") as string,
    permissions: effectivePerms(m as MemberRow),
    status: (m.status ?? "active") as string,
    since: m.created_at as string,
    suspendedAt: (m.suspended_at ?? null) as string | null,
    me: m.user_id === profile.id,
  }));
  const invitations = ((invs ?? []) as Record<string, unknown>[]).map((i) => ({ ...i, state: invitationState(i as never), invitedBy: who(i.created_by as string)?.full_name || who(i.created_by as string)?.email || "" }));
  return NextResponse.json({ sector, manage, myRole: me?.role, members, invitations, positions, permissions: SECTOR_PERMISSIONS[sector], seats: seat, company: project.name });
});
