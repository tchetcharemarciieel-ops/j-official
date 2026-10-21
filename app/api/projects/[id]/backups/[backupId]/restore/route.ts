import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { createBackup } from "@/lib/projects";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; backupId: string }> };

type Snap = { id: string; entity: string; data: unknown; created_at: string; updated_at: string; created_by: string | null };

/** Restaure les données réelles d'une sauvegarde. L'état actuel est sauvegardé avant. */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id, backupId } = await params;
  const { profile, project } = await getAccess(id, ["owner"]);
  const { confirm } = z.object({ confirm: z.literal(true) }).parse(await readJson(req));
  void confirm;
  const db = adminClient();
  const { data: backup } = await db.from("backups").select("*").eq("id", backupId).eq("project_id", id).maybeSingle();
  if (!backup) throw new HttpError(404, "Sauvegarde introuvable.");
  await createBackup(id, "Avant restauration", profile.id, project.published_version);
  const rows = (backup.records as Snap[]).map((r) => ({ id: r.id, project_id: id, entity: r.entity, data: r.data, is_demo: false, created_at: r.created_at, updated_at: r.updated_at, created_by: r.created_by }));
  const { error: delErr } = await db.from("records").delete().eq("project_id", id).eq("is_demo", false);
  if (delErr) throw new HttpError(500, "Restauration impossible.");
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("records").insert(rows.slice(i, i + 500));
    if (error) {
      await audit("backup.restore_failed", { projectId: id, actorId: profile.id, level: "error", details: { message: error.message } });
      throw new HttpError(500, "Restauration interrompue. Une sauvegarde « Avant restauration » a été créée.");
    }
  }
  await audit("backup.restored", { projectId: id, actorId: profile.id, level: "warning", details: { backupId, count: rows.length } });
  return NextResponse.json({ ok: true, count: rows.length });
});
