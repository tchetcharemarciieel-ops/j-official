import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { appContext, requireEntity } from "@/lib/app-data";

type Ctx = { params: Promise<{ id: string; recordId: string }> };
const modeSchema = z.enum(["demo", "live"]);

/** Historique d'une fiche (création, modifications avec les champs changés, suppression) : mêmes droits de lecture que la fiche. */
export const GET = route(async (req, { params }: Ctx) => {
  const { id, recordId } = await params;
  const mode = modeSchema.parse(new URL(req.url).searchParams.get("mode") ?? "live");
  if (!/^[0-9a-f-]{36}$/i.test(recordId)) throw new HttpError(404, "Fiche introuvable.");
  const ctx = await appContext(id, mode);
  const db = adminClient();
  const { data: rec } = await db.from("records").select("entity").eq("id", recordId).eq("project_id", id).eq("is_demo", mode === "demo").maybeSingle();
  if (!rec) throw new HttpError(404, "Fiche introuvable.");
  const entity = requireEntity(ctx, rec.entity, "read");
  const { data } = await db.from("record_history").select("action,before,after,actor_id,created_at").eq("project_id", id).eq("record_id", recordId).order("created_at", { ascending: false }).limit(30);
  const rows = data ?? [];
  const ids = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean)));
  const { data: people } = ids.length ? await db.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const who = (aid: string | null) => { const p = (people ?? []).find((x) => x.id === aid); return (p?.full_name?.trim() || p?.email?.split("@")[0] || "Un membre").slice(0, 40); };
  const label = (k: string) => entity.fields.find((f) => f.key === k)?.label ?? k;
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "vide" : typeof v === "boolean" ? (v ? "oui" : "non") : String(v).slice(0, 60));
  const history = rows.map((r) => {
    const before = (r.before ?? {}) as Record<string, unknown>;
    const after = (r.after ?? {}) as Record<string, unknown>;
    const changes = r.action === "update" ? Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).slice(0, 8).map((k) => ({ field: label(k), from: show(before[k]), to: show(after[k]) })) : [];
    return { action: r.action as "create" | "update" | "delete", at: r.created_at as string, by: who(r.actor_id), changes };
  });
  return NextResponse.json({ history });
});
