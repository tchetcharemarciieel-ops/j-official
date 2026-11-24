import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ jobId: string }> };

/** État d'une analyse lancée plus tôt (retour sur la page après l'avoir quittée). */
export const GET = route(async (_req, ctx: Ctx) => {
  const profile = await getProfile();
  if (!profile) throw new HttpError(401, "Connectez-vous pour retrouver votre analyse.");
  const { jobId } = await ctx.params;
  if (!z.string().uuid().safeParse(jobId).success) throw new HttpError(404, "Analyse introuvable.");
  const { data } = await adminClient().from("diagnose_jobs").select("status,response,error,created_at").eq("id", jobId).eq("user_id", profile.id).maybeSingle();
  if (!data) throw new HttpError(404, "Analyse introuvable.");
  return NextResponse.json({ status: data.status, response: data.status === "done" ? data.response : undefined, error: data.error ?? undefined });
});
