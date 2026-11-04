import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { HttpError, publishedSpec, type ProjectRow } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { effectiveWorkspace } from "@/lib/workspace";
import { OpError, runOp } from "@/lib/venue/engine";
import { SupabaseStore } from "@/lib/venue/supabase-store";
import { hashToken } from "@/lib/venue/vision-ops";
import type { Camera } from "@/lib/venue/vision";
import type { Doc } from "@/lib/venue/model";

type Ctx = { params: Promise<{ id: string }> };

// Limite par caméra (par instance du serveur) : une passerelle n'a pas besoin de plus d'un envoi par seconde.
const hits = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > 90;
}

const bodySchema = z.object({
  camera_id: z.string().uuid(),
  observations: z.array(z.object({ table_id: z.string().min(1).max(64), occupied: z.boolean(), people: z.number().int().min(0).max(60).optional() }).strict()).min(1).max(200),
  idem: z.string().min(8).max(80).optional(),
});

/**
 * Point d'entrée des passerelles de détection (Vision IA). Une passerelle installée au restaurant
 * analyse les images sur place et n'envoie ici que l'état stabilisé de chaque table : aucune image,
 * aucun visage, aucune donnée personnelle. Authentification : `Authorization: Bearer <clé de la caméra>`.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Logiciel introuvable.");
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("msv_") || token.length > 100) throw new HttpError(401, "Clé de caméra manquante ou invalide.");
  const body = bodySchema.parse(await readJson(req, 64_000));
  if (limited(body.camera_id)) throw new HttpError(429, "Trop d'envois : une détection par seconde au maximum.");

  const db = adminClient();
  const { data: project } = await db.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) throw new HttpError(404, "Logiciel introuvable.");
  if ((project as ProjectRow).status === "suspended") throw new HttpError(423, "Ce logiciel est suspendu.");
  const spec = publishedSpec(project as ProjectRow);
  const layout = spec ? effectiveWorkspace(spec).layout : null;
  if (layout !== "restaurant" && layout !== "hotel") throw new HttpError(404, "Ce logiciel n'a pas de module restaurant.");

  // Les écritures sont tracées au nom du propriétaire, avec la caméra comme origine.
  const ownerId = (project as ProjectRow).owner_id;
  const store = new SupabaseStore(id, false, ownerId);
  const cam = (await store.get("vcam", body.camera_id)) as Doc<Camera> | null;
  const expected = cam?.data.token_hash ?? "";
  const given = await hashToken(token);
  if (!cam || !cam.data.active || expected.length !== given.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(given))) throw new HttpError(401, "Clé de caméra invalide ou révoquée.");

  try {
    const r = await runOp({ store, actor: { id: ownerId, role: "employee" }, members: [], kind: layout, gateway: cam.id }, "vision.detect", { source: "camera", camera_id: cam.id, observations: body.observations, idem: body.idem ?? `gw:${cam.id}:${Date.now()}` });
    return NextResponse.json({ ok: true, message: r.message });
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
