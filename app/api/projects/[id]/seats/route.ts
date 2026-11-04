import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { seatInfo, teamActor } from "@/lib/team-server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Demande d'accès supplémentaires : transmise à l'équipe MiniSoft RCA, qui répond avec les
 * conditions (aucun tarif n'est affiché ni inventé ici). Les places sont ajoutées par un
 * administrateur de la plateforme.
 */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id);
  await teamActor(id, profile.id);
  const input = z.object({ seats: z.coerce.number().int().min(1).max(100), note: z.string().trim().max(500).default("") }).parse(await readJson(req));
  const seat = await seatInfo(project);
  const db = adminClient();
  const { data: admins } = await db.from("profiles").select("id").eq("is_admin", true).limit(20);
  if (!admins?.length) throw new HttpError(503, "Demande impossible pour le moment : contactez l'assistance.");
  await db.from("notifications").insert(admins.map((a) => ({ user_id: a.id, project_id: id, type: "team", title: `Demande d'accès supplémentaires : ${project.name}`.slice(0, 160), body: `${profile.full_name || profile.email} demande ${input.seats} accès en plus (actuellement ${seat.used} utilisés et ${seat.pending} en attente sur ${seat.total}).${input.note ? ` Message : ${input.note}` : ""}`.slice(0, 1000), link: `/admin` })));
  await audit("seats.requested", { projectId: id, actorId: profile.id, details: { seats: input.seats, current: seat } });
  return NextResponse.json({ ok: true });
});
