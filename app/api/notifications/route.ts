import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/** Notifications de l'utilisateur connecté (et uniquement les siennes). */
export const GET = route(async () => {
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connexion requise.");
  const db = adminClient();
  const [{ data }, { count }] = await Promise.all([
    db.from("notifications").select("id,type,title,body,link,read_at,created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(30),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", profile.id).is("read_at", null),
  ]);
  return NextResponse.json({ notifications: data ?? [], unread: count ?? 0 });
});

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connexion requise.");
  const { ids } = z.object({ ids: z.array(z.string().uuid()).max(100).optional() }).parse(await readJson(req));
  let q = adminClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", profile.id).is("read_at", null);
  if (ids?.length) q = q.in("id", ids);
  await q;
  return NextResponse.json({ ok: true });
});
