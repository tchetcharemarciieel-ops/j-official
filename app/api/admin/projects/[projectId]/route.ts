import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ projectId: string }> };

/** Suspension d'une publication par la plateforme (abus). */
export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const admin = await getProfile();
  if (!admin?.is_admin) throw new HttpError(404, "Introuvable.");
  const { projectId } = await params;
  const { action } = z.object({ action: z.enum(["suspend", "resume"]) }).parse(await readJson(req));
  const db = adminClient();
  const { data: p } = await db.from("projects").select("status,published_spec").eq("id", projectId).maybeSingle();
  if (!p) throw new HttpError(404, "Projet introuvable.");
  if (action === "resume" && !p.published_spec) throw new HttpError(409, "Jamais publié.");
  await db.from("projects").update({ status: action === "suspend" ? "suspended" : "published" }).eq("id", projectId);
  await audit(`admin.project_${action}`, { projectId, actorId: admin.id, level: "warning" });
  return NextResponse.json({ ok: true });
});
