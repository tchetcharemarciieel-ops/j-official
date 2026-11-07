import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { audit } from "@/lib/audit";
import { adminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };
const ENTITY = "ws:plan";

/**
 * Confirmation du plan de l'espace de travail : le responsable confirme que le plan (3D et 2D)
 * correspond à son établissement. On garde le plan validé (instantané) et son statut ; si le plan
 * change ensuite, l'écran indique qu'il est à reconfirmer.
 */
async function current(projectId: string, demo: boolean) {
  const { data } = await adminClient().from("records").select("id,data,updated_at").eq("project_id", projectId).eq("entity", ENTITY).eq("is_demo", demo).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data as { id: string; data: { snapshot: unknown; confirmed_at: string; confirmed_by: string; confirmed_by_name: string }; updated_at: string } | null;
}

export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  await getAccess(id);
  const demo = new URL(req.url).searchParams.get("mode") === "demo";
  const c = await current(id, demo);
  return NextResponse.json({ confirmation: c ? c.data : null }, { headers: { "cache-control": "no-store" } });
});

const body = z.object({ mode: z.enum(["live", "demo"]), snapshot: z.record(z.string(), z.unknown()) });

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, role, perms } = await getAccess(id);
  const allowed = (role === "owner" || role === "admin" || role === "manager") && (perms === null || perms.includes("parametres"));
  if (!allowed) throw new HttpError(403, "Seul le responsable de l'établissement peut confirmer le plan.");
  const input = body.parse(await readJson(req, 20_000));
  const demo = input.mode === "demo";
  const data = { snapshot: input.snapshot, confirmed_at: new Date().toISOString(), confirmed_by: profile.id, confirmed_by_name: profile.full_name || profile.email || "Responsable" };
  const db = adminClient();
  const c = await current(id, demo);
  const { error } = c
    ? await db.from("records").update({ data, updated_by: profile.id, updated_at: data.confirmed_at }).eq("id", c.id)
    : await db.from("records").insert({ project_id: id, entity: ENTITY, data, is_demo: demo, created_by: profile.id, updated_by: profile.id });
  if (error) throw new HttpError(500, "Enregistrement de la confirmation impossible.");
  if (!demo) await audit("workspace.plan_confirmed", { projectId: id, actorId: profile.id, details: { snapshot: input.snapshot } });
  return NextResponse.json({ confirmation: data });
});
