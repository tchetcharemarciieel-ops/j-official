import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { appContext, type AppContext } from "@/lib/app-data";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { effectiveWorkspace } from "@/lib/workspace";
import { LEVEL, type VenueKind } from "@/lib/venue/model";
import { OpError, runOp } from "@/lib/venue/engine";
import { SupabaseStore } from "@/lib/venue/supabase-store";
import type { Role } from "@/lib/spec";

type Ctx = { params: Promise<{ id: string }> };
const modeSchema = z.enum(["demo", "live"]);

/** Le module n'existe que pour les logiciels dont l'espace de travail est un restaurant ou un hôtel. */
async function venueContext(id: string, mode: "demo" | "live"): Promise<AppContext & { kind: VenueKind }> {
  const ctx = await appContext(id, mode);
  const layout = effectiveWorkspace(ctx.spec).layout;
  if (layout !== "restaurant" && layout !== "hotel") throw new HttpError(404, "Ce logiciel n'a pas de module restaurant ou hôtel.");
  return { ...ctx, kind: layout };
}

async function members(projectId: string) {
  const db = adminClient();
  const { data: rows } = await db.from("project_members").select("user_id,role").eq("project_id", projectId).limit(100);
  const ids = (rows ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] as { id: string; full_name: string | null; email: string }[] };
  return (rows ?? []).map((m) => {
    const p = (profiles ?? []).find((x) => x.id === m.user_id);
    return { id: m.user_id as string, name: (p?.full_name?.trim() || p?.email?.split("@")[0] || "Membre").slice(0, 40), role: m.role as Role };
  });
}

/** Données lisibles par le rôle : dépenses réservées aux gérants, fiches clients à l'équipe. */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const url = new URL(req.url);
  const mode = modeSchema.parse(url.searchParams.get("mode") ?? "live");
  const ctx = await venueContext(id, mode);
  const store = new SupabaseStore(id, mode === "demo", ctx.profile.id);
  if (url.searchParams.get("photos")) return NextResponse.json({ photos: await store.photos() });
  const [data, team] = await Promise.all([store.all(), members(id)]);
  const level = LEVEL[ctx.role];
  if (level < 2) data.expense = [];
  if (level < 1) {
    data.guest = [];
    data.staff = [];
  }
  return NextResponse.json({ data, members: team, role: ctx.role, me: ctx.profile.id, kind: ctx.kind });
});

const SENSITIVE = new Set(["payment.cancel", "order.cancel", "item.count", "expense.delete", "stay.status", "photo.delete"]);

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z.object({ mode: modeSchema, op: z.string().max(40), input: z.unknown() }).parse(await readJson(req, 600_000));
  const ctx = await venueContext(id, input.mode);
  const team = await members(id);
  try {
    const result = await runOp({ store: new SupabaseStore(id, input.mode === "demo", ctx.profile.id), actor: { id: ctx.profile.id, role: ctx.role }, members: team.map((m) => m.id), kind: ctx.kind }, input.op, input.input);
    if (input.mode === "live") {
      if (SENSITIVE.has(input.op) && !result.duplicate) {
        const details = { ...(input.input as Record<string, unknown>) };
        delete details.data_url;
        await audit(`${ctx.kind}.${input.op}`, { projectId: id, actorId: ctx.profile.id, level: "warning", details });
      }
      const rows: { user_id: string; project_id: string; type: string; title: string; body: string; link: string }[] = [];
      const others = team.filter((m) => m.id !== ctx.profile.id);
      for (const e of result.effects) {
        if (e.type === "order_ready") for (const m of others) rows.push({ user_id: m.id, project_id: id, type: "info", title: `Commande prête : ${e.number}`, body: `La cuisine a terminé la commande ${e.number} (${e.where}).`, link: `/apps/${ctx.project.slug}` });
        if (e.type === "temp_alert") for (const m of team.filter((x) => LEVEL[x.role] >= 2 && x.id !== ctx.profile.id)) rows.push({ user_id: m.id, project_id: id, type: "error", title: "Température hors seuil", body: `Relevé saisi : ${e.value} °C, ${e.reason}.`, link: `/apps/${ctx.project.slug}` });
      }
      // Une notification manquée ne doit jamais faire échouer l'opération elle-même.
      if (rows.length) await adminClient().from("notifications").insert(rows.map((r) => ({ ...r, title: r.title.slice(0, 160) }))).then(() => undefined, () => undefined);
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
