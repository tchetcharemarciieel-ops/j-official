import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { afterChange, appContext, requireEntity, stripReadonly } from "@/lib/app-data";
import { validateRecord } from "@/lib/records";

type Ctx = { params: Promise<{ id: string; recordId: string }> };
const modeSchema = z.enum(["demo", "live"]);

async function load(projectId: string, recordId: string, demo: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(recordId)) throw new HttpError(404, "Fiche introuvable.");
  // Le filtre project_id garantit qu'une fiche d'un autre logiciel n'est jamais atteinte.
  const { data } = await adminClient().from("records").select("id,entity,data,updated_at").eq("id", recordId).eq("project_id", projectId).eq("is_demo", demo).maybeSingle();
  if (!data) throw new HttpError(404, "Fiche introuvable.");
  return data;
}

export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id, recordId } = await params;
  const input = z.object({ mode: modeSchema, data: z.record(z.string(), z.unknown()), expectedUpdatedAt: z.string().optional() }).parse(await readJson(req));
  const ctx = await appContext(id, input.mode);
  const existing = await load(id, recordId, input.mode === "demo");
  const entity = requireEntity(ctx, existing.entity, "update");
  // Détection de conflit : la fiche a été modifiée par quelqu'un d'autre entre-temps.
  if (input.expectedUpdatedAt && new Date(input.expectedUpdatedAt).getTime() !== new Date(existing.updated_at).getTime())
    return NextResponse.json({ error: "Cette fiche a été modifiée entre-temps par un autre utilisateur.", conflict: true, current: existing }, { status: 409 });
  const v = validateRecord(entity, stripReadonly(entity, ctx, input.data), true);
  if (!v.ok) return NextResponse.json({ error: "Certains champs sont invalides.", fieldErrors: v.errors }, { status: 422 });
  const merged = { ...(existing.data as object), ...v.data };
  const { data: record, error } = await adminClient()
    .from("records")
    .update({ data: merged, updated_by: ctx.profile.id, updated_at: new Date().toISOString() })
    .eq("id", recordId)
    .eq("project_id", id)
    .select("id,entity,data,created_at,updated_at")
    .single();
  if (error || !record) throw new HttpError(500, "Modification impossible.");
  await afterChange(ctx, entity, "updated", recordId, existing.data, merged);
  return NextResponse.json({ record });
});

export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id, recordId } = await params;
  const mode = modeSchema.parse(new URL(req.url).searchParams.get("mode") ?? "live");
  const ctx = await appContext(id, mode);
  const existing = await load(id, recordId, mode === "demo");
  const entity = requireEntity(ctx, existing.entity, "delete");
  await adminClient().from("records").delete().eq("id", recordId).eq("project_id", id);
  await afterChange(ctx, entity, "deleted", recordId, existing.data, null);
  return NextResponse.json({ ok: true });
});
