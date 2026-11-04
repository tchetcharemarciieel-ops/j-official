import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { POSITIONS, invitationState } from "@/lib/team";

/** Invitations en attente pour l'adresse de la personne connectée (si elle n'a pas gardé le lien). */
export const GET = route(async () => {
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connexion requise.");
  const db = adminClient();
  const { data } = await db.from("invitations").select("id,project_id,position,full_name,expires_at,accepted_at,revoked_at,created_at").eq("email", profile.email.toLowerCase()).is("accepted_at", null).is("revoked_at", null).limit(20);
  const valid = (data ?? []).filter((i) => invitationState(i) === "en_attente");
  const ids = [...new Set(valid.map((i) => i.project_id))];
  const [{ data: projects }, { data: custom }] = ids.length ? await Promise.all([db.from("projects").select("id,name").in("id", ids), db.from("project_positions").select("project_id,key,label").in("project_id", ids)]) : [{ data: [] as { id: string; name: string }[] }, { data: [] as { project_id: string; key: string; label: string }[] }];
  const label = (pid: string, key: string) => Object.values(POSITIONS).flat().find((p) => p.key === key)?.label ?? custom?.find((c) => c.project_id === pid && c.key === key)?.label ?? key;
  return NextResponse.json({ invitations: valid.map((i) => ({ id: i.id, company: projects?.find((p) => p.id === i.project_id)?.name ?? "", position: i.position ? label(i.project_id, i.position) : "", expiresAt: i.expires_at })) });
});
