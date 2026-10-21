import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { appContext, requireEntity } from "@/lib/app-data";
import { validateRecord } from "@/lib/records";
import { createBackup } from "@/lib/projects";
import { audit } from "@/lib/audit";
import { MAX_IMPORT_ROWS } from "@/lib/config";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Import CSV/Excel en deux temps : `dryRun` valide et renvoie les erreurs ligne par ligne,
 * puis l'import réel n'a lieu qu'après confirmation explicite du propriétaire.
 */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z
    .object({
      mode: z.enum(["demo", "live"]),
      entity: z.string().max(40),
      mapping: z.record(z.string().max(80), z.string().max(40)),
      rows: z.array(z.record(z.string().max(80), z.string().max(5000))).max(MAX_IMPORT_ROWS),
      dryRun: z.boolean(),
      confirmSensitive: z.boolean().default(false),
    })
    .parse(await readJson(req, 8_000_000));
  const ctx = await appContext(id, input.mode);
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new HttpError(403, "Import réservé au propriétaire, aux administrateurs et aux gestionnaires.");
  const entity = requireEntity(ctx, input.entity, "create");
  const validKeys = new Set(entity.fields.map((f) => f.key));
  const mapping = Object.fromEntries(Object.entries(input.mapping).filter(([, k]) => validKeys.has(k)));

  const errors: { line: number; errors: Record<string, string> }[] = [];
  const valid: Record<string, unknown>[] = [];
  input.rows.forEach((row, i) => {
    const mapped: Record<string, unknown> = {};
    for (const [col, key] of Object.entries(mapping)) mapped[key] = row[col];
    const v = validateRecord(entity, mapped);
    if (v.ok) valid.push(v.data);
    else errors.push({ line: i + 2, errors: v.errors });
  });
  const sensitive = entity.fields.some((f) => ["email", "phone"].includes(f.type) && Object.values(mapping).includes(f.key));
  if (input.dryRun) return NextResponse.json({ valid: valid.length, invalid: errors.length, errors: errors.slice(0, 50), sensitive });
  if (sensitive && !input.confirmSensitive) throw new HttpError(400, "Ce fichier contient des coordonnées personnelles : confirmez l'import.");
  if (!valid.length) throw new HttpError(400, "Aucune ligne valide à importer.");

  if (input.mode === "live") await createBackup(id, `Avant import dans ${entity.labelPlural}`, ctx.profile.id, ctx.project.published_version);
  const db = adminClient();
  for (let i = 0; i < valid.length; i += 500) {
    const { error } = await db.from("records").insert(valid.slice(i, i + 500).map((data) => ({ project_id: id, entity: entity.key, data, is_demo: input.mode === "demo", created_by: ctx.profile.id })));
    if (error) throw new HttpError(500, `Import interrompu après ${i} ligne(s).`);
  }
  await audit("records.imported", { projectId: id, actorId: ctx.profile.id, details: { entity: entity.key, count: valid.length, mode: input.mode, skipped: errors.length } });
  return NextResponse.json({ imported: valid.length, skipped: errors.length });
});
