import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { getProfile } from "@/lib/auth";
import { reconcilePending } from "@/lib/billing";
import { HttpError } from "@/lib/access";
import { clientIp, limited } from "@/lib/venue/public";
import { adminClient } from "@/lib/supabase/admin";

/** Vérifie auprès de SasPay les paiements en attente du client connecté et renvoie sa formule. */
export const GET = route(async (req) => {
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connexion requise.");
  if (limited(`billing-status:${profile.id}`, 40) || limited(`billing-status-ip:${clientIp(req)}`, 120)) throw new HttpError(429, "Trop de requêtes.");
  const r = await reconcilePending({ userId: profile.id, limit: 5 });
  const { data } = await adminClient().from("profiles").select("plan").eq("id", profile.id).maybeSingle();
  return NextResponse.json({ plan: data?.plan ?? profile.plan, activated: r.activated > 0, pending: r.pending });
});
