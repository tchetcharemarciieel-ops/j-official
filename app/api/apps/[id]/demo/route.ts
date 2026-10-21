import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { appContext } from "@/lib/app-data";
import { sampleRecord } from "@/lib/checks";

type Ctx = { params: Promise<{ id: string }> };

/** Données de démonstration : toujours séparées des données réelles (is_demo = true). */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { action } = z.object({ action: z.enum(["seed", "clear"]) }).parse(await readJson(req));
  const ctx = await appContext(id, "demo");
  const db = adminClient();
  await db.from("records").delete().eq("project_id", id).eq("is_demo", true);
  if (action === "clear") return NextResponse.json({ ok: true });

  const created: Record<string, string[]> = {};
  // Les tables référencées sont remplies en premier pour que les liens pointent vers de vraies fiches.
  const ordered = [...ctx.spec.entities].sort((a, b) => Number(a.fields.some((f) => f.type === "relation")) - Number(b.fields.some((f) => f.type === "relation")));
  for (const e of ordered) {
    const rows = Array.from({ length: 6 }, (_, i) => {
      const data = sampleRecord(e, i);
      for (const f of e.fields) if (f.type === "relation" && f.relation && created[f.relation]?.length) data[f.key] = created[f.relation]![i % created[f.relation]!.length]!;
      const now = Date.now();
      return { project_id: id, entity: e.key, data, is_demo: true, created_by: ctx.profile.id, created_at: new Date(now - i * 9 * 86400000).toISOString() };
    });
    const { data, error } = await db.from("records").insert(rows).select("id");
    if (error) throw new HttpError(500, "Création des données de démonstration impossible.");
    created[e.key] = (data ?? []).map((r) => r.id);
  }
  return NextResponse.json({ ok: true, counts: Object.fromEntries(Object.entries(created).map(([k, v]) => [k, v.length])) });
});
