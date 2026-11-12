import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { appContext, type AppContext } from "@/lib/app-data";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { effectiveWorkspace } from "@/lib/workspace";
import { LEVEL, type VenueKind } from "@/lib/venue/model";
import { effectivePerms, has, type MemberRow } from "@/lib/team";
import { OpError, runOp } from "@/lib/venue/engine";
import { pushOrderUpdates } from "@/lib/venue/order-push";
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
  // Les membres suspendus ne font plus partie de l'équipe (ni attribution, ni notification).
  const { data: all } = await db.from("project_members").select("*").eq("project_id", projectId).limit(100);
  const rows = (all ?? []).filter((m) => m.status !== "suspended");
  const ids = (rows ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] as { id: string; full_name: string | null; email: string }[] };
  return (rows ?? []).map((m) => {
    const p = (profiles ?? []).find((x) => x.id === m.user_id);
    // « Commande prête » : seulement pour ceux qui servent ou encaissent (pas le stock ni la cuisine).
    return { id: m.user_id as string, name: (p?.full_name?.trim() || p?.email?.split("@")[0] || "Membre").slice(0, 40), role: m.role as Role, serves: has(effectivePerms(m as MemberRow), ["caisse", "salle", "reception", "restaurant"]) };
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
  if (url.searchParams.get("check")) return NextResponse.json({ sig: await store.signature() }, { headers: { "cache-control": "no-store" } });
  const [data, team] = await Promise.all([store.all(), members(id)]);
  const level = LEVEL[ctx.role];
  // Données visibles selon le rôle, puis selon le poste de l'employé (permissions).
  if (level < 2 || !has(ctx.perms, "finances")) data.expense = [];
  if (level < 1 || !has(ctx.perms, ["reception"])) data.guest = [];
  if (level < 1) data.staff = [];
  else if (!has(ctx.perms, "personnel")) data.staff = data.staff.map((x) => ({ ...x, data: { name: x.data.name, role: x.data.role, member_id: x.data.member_id, active: x.data.active, phone: "", notes: "", schedule: [] } }));
  if (!has(ctx.perms, ["caisse", "reception", "finances", "rapports"])) data.payment = [];
  // Empreinte de la clé des passerelles caméra : jamais envoyée au navigateur.
  data.vcam = data.vcam.map((c) => ({ ...c, data: { ...c.data, token_hash: null } }));
  // Jetons de suivi des commandes en ligne : jamais renvoyés à l'équipe (ils restent au client).
  data.order = data.order.map((o) => (o.data.tracking_token ? { ...o, data: { ...o.data, tracking_token: "masque" } } : o));
  return NextResponse.json({ data, members: team, role: ctx.role, me: ctx.profile.id, kind: ctx.kind, slug: ctx.project.slug, perms: ctx.perms, position: ctx.position });
});

const SENSITIVE = new Set(["payment.cancel", "order.cancel", "item.count", "expense.delete", "stay.status", "photo.delete"]);

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z.object({ mode: modeSchema, op: z.string().max(40), input: z.unknown() }).parse(await readJson(req, 600_000));
  const ctx = await venueContext(id, input.mode);
  const team = await members(id);
  try {
    const store = new SupabaseStore(id, input.mode === "demo", ctx.profile.id);
    const result = await runOp({ store, actor: { id: ctx.profile.id, role: ctx.role }, members: team.map((m) => m.id), kind: ctx.kind, demo: input.mode === "demo", perms: ctx.perms }, input.op, input.input);
    if (input.mode === "live") {
      if (SENSITIVE.has(input.op) && !result.duplicate) {
        const details = { ...(input.input as Record<string, unknown>) };
        delete details.data_url;
        await audit(`${ctx.kind}.${input.op}`, { projectId: id, actorId: ctx.profile.id, level: "warning", details });
      }
      const rows: { user_id: string; project_id: string; type: string; title: string; body: string; link: string }[] = [];
      const others = team.filter((m) => m.id !== ctx.profile.id);
      for (const e of result.effects) {
        if (e.type === "order_ready") for (const m of others.filter((x) => x.serves)) rows.push({ user_id: m.id, project_id: id, type: "info", title: `Commande prête : ${e.number}`, body: `La cuisine a terminé la commande ${e.number} (${e.where}).`, link: `/apps/${ctx.project.slug}` });
        if (e.type === "vision_alert") for (const m of team) rows.push({ user_id: m.id, project_id: id, type: "error", title: `Table ${e.table} : délai dépassé`, body: `${e.kind} : ${e.minutes} min d'attente.`, link: `/apps/${ctx.project.slug}` });
        if (e.type === "temp_alert") for (const m of team.filter((x) => LEVEL[x.role] >= 2 && x.id !== ctx.profile.id)) rows.push({ user_id: m.id, project_id: id, type: "error", title: "Température hors seuil", body: `Relevé saisi : ${e.value} °C, ${e.reason}.`, link: `/apps/${ctx.project.slug}` });
      }
      // Une notification manquée ne doit jamais faire échouer l'opération elle-même.
      if (rows.length) await adminClient().from("notifications").insert(rows.map((r) => ({ ...r, title: r.title.slice(0, 160) }))).then(() => undefined, () => undefined);
    }
    // Suivi de commande : notifications push au client pour les nouvelles étapes (sans bloquer).
    void pushOrderUpdates(id, input.mode === "demo", () => store.list("order"));
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
