import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { afterChange, appContext, requireEntity, stripReadonly } from "@/lib/app-data";
import { validateRecord } from "@/lib/records";
import { can } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };
const modeSchema = z.enum(["demo", "live"]);

/** Lecture de toutes les tables lisibles par le rôle (filtrage serveur). */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const mode = modeSchema.parse(new URL(req.url).searchParams.get("mode") ?? "live");
  const ctx = await appContext(id, mode);
  const readable = ctx.spec.entities.filter((e) => can(e, ctx.role, "read")).map((e) => e.key);
  const result: Record<string, unknown[]> = Object.fromEntries(readable.map((k) => [k, []]));
  if (readable.length) {
    const { data, error } = await adminClient()
      .from("records")
      .select("id,entity,data,created_at,updated_at")
      .eq("project_id", id)
      .eq("is_demo", mode === "demo")
      .in("entity", readable)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new HttpError(500, "Lecture des données impossible.");
    for (const r of data ?? []) result[r.entity]!.push(r);
  }
  return NextResponse.json({ records: result, role: ctx.role, version: mode === "demo" ? ctx.project.draft_version : ctx.project.published_version });
});

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z.object({ mode: modeSchema, entity: z.string().max(40), data: z.record(z.string(), z.unknown()), clientId: z.string().max(64).optional() }).parse(await readJson(req));
  const ctx = await appContext(id, input.mode);
  const entity = requireEntity(ctx, input.entity, "create");
  const v = validateRecord(entity, stripReadonly(entity, ctx, input.data));
  if (!v.ok) return NextResponse.json({ error: "Certains champs sont invalides.", fieldErrors: v.errors }, { status: 422 });
  const db = adminClient();
  // Idempotence pour la synchronisation hors ligne : un même envoi n'est jamais enregistré deux fois.
  if (input.clientId) {
    const { data: dup } = await db.from("records").select("id,entity,data,created_at,updated_at").eq("project_id", id).eq("entity", entity.key).eq("data->>__client_id", input.clientId).maybeSingle();
    if (dup) return NextResponse.json({ record: dup, duplicate: true });
  }
  const data = input.clientId ? { ...v.data, __client_id: input.clientId } : v.data;
  const { data: record, error } = await db
    .from("records")
    .insert({ project_id: id, entity: entity.key, data, is_demo: input.mode === "demo", created_by: ctx.profile.id, updated_by: ctx.profile.id })
    .select("id,entity,data,created_at,updated_at")
    .single();
  if (error || !record) throw new HttpError(500, "Enregistrement impossible.");
  await afterChange(ctx, entity, "created", record.id, null, v.data);
  return NextResponse.json({ record });
});
