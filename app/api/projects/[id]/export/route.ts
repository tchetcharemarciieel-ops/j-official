import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { getAccess, HttpError, publishedSpec, draftSpec } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { toCsv, type RecordData } from "@/lib/records";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Export des données réelles d'un logiciel (une table en CSV, ou tout en JSON). Propriétaire et administrateurs uniquement. */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  const spec = publishedSpec(project) ?? draftSpec(project);
  if (!spec) throw new HttpError(409, "Le logiciel n'a pas encore été généré.");
  const url = new URL(req.url);
  const entityKey = url.searchParams.get("table");
  const db = adminClient();
  const { data: rows, error } = await db.from("records").select("entity,data,created_at,updated_at").eq("project_id", id).eq("is_demo", false).limit(50000);
  if (error) throw new HttpError(500, "Export impossible.");
  await audit("data.exported", { projectId: id, actorId: profile.id, details: { table: entityKey ?? "toutes" } });
  const date = new Date().toISOString().slice(0, 10);
  if (entityKey) {
    const entity = spec.entities.find((e) => e.key === entityKey);
    if (!entity) throw new HttpError(404, "Table introuvable.");
    const csv = "﻿" + toCsv(entity, (rows ?? []).filter((r) => r.entity === entityKey).map((r) => ({ data: r.data as RecordData })));
    return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${project.slug}-${entityKey}-${date}.csv"` } });
  }
  const out = Object.fromEntries(spec.entities.map((e) => [e.labelPlural, (rows ?? []).filter((r) => r.entity === e.key).map((r) => ({ ...(r.data as object), cree_le: r.created_at, modifie_le: r.updated_at }))]));
  return new NextResponse(JSON.stringify({ logiciel: spec.name, exporte_le: new Date().toISOString(), donnees: out }, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${project.slug}-donnees-${date}.json"` },
  });
});
