import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { appContext, type AppContext } from "@/lib/app-data";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { notifyStaff } from "@/lib/notify";
import { has } from "@/lib/team";
import { OpError, allowed, runOp } from "@/lib/shop/engine";
import { SupabaseStore } from "@/lib/shop/supabase-store";
import { settingsOf, type Doc, type Move, type Product, type Sale } from "@/lib/shop/model";
import { zpConfig } from "@/lib/zingopay";
import type { Role } from "@/lib/spec";

type Ctx = { params: Promise<{ id: string }> };
const modeSchema = z.enum(["demo", "live"]);

/** Le module boutique n'existe que pour les logiciels MiniSoft Shop. */
async function shopContext(id: string, mode: "demo" | "live"): Promise<AppContext> {
  const ctx = await appContext(id, mode);
  if (ctx.spec.module !== "shop") throw new HttpError(404, "Ce logiciel n'est pas une boutique MiniSoft Shop.");
  return ctx;
}

async function members(projectId: string) {
  const db = adminClient();
  const { data: rows } = await db.from("project_members").select("user_id,role,status,position").eq("project_id", projectId).limit(100);
  const ids = (rows ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] as { id: string; full_name: string | null; email: string }[] };
  return (rows ?? []).map((m) => {
    const p = (profiles ?? []).find((x) => x.id === m.user_id);
    return { id: m.user_id as string, name: (p?.full_name?.trim() || p?.email?.split("@")[0] || "Membre").slice(0, 40), role: m.role as Role, active: m.status !== "suspended" };
  });
}

const stripCost = (p: Doc): Doc => {
  const d = p.data as unknown as Product;
  return { ...p, data: { ...d, buy_price: 0, variants: d.variants.map((v) => ({ ...v, buy_price: null })), op_keys: [] } as unknown as Record<string, unknown> };
};

/**
 * Données de la boutique lisibles par le poste de l'utilisateur. Le serveur retire ce que le poste
 * ne doit pas voir (prix d'achat et marges pour la caisse, dépenses hors finances, etc.) :
 * l'interface ne fait jamais seule le tri.
 */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const url = new URL(req.url);
  const mode = modeSchema.parse(url.searchParams.get("mode") ?? "live");
  const ctx = await shopContext(id, mode);
  const store = new SupabaseStore(id, mode === "demo", ctx.profile.id);
  const img = url.searchParams.get("img");
  if (img) {
    const doc = await store.photo(img);
    const m = doc ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(doc.data.data)) : null;
    if (!m) throw new HttpError(404, "Image introuvable.");
    return new NextResponse(Buffer.from(m[2]!, "base64"), { headers: { "Content-Type": m[1]!, "Cache-Control": "private, max-age=86400" } });
  }
  const [data, team, zp] = await Promise.all([store.all(), members(id), zpConfig(id).catch(() => null)]);
  const p = ctx.perms;
  const seeCost = has(p, ["stock", "achats", "rapports", "finances"]);
  if (!seeCost) {
    data.product = data.product.map(stripCost);
    data.sale = data.sale.map((s) => ({ ...s, data: { ...(s.data as unknown as Sale), items: (s.data as unknown as Sale).items.map((l) => ({ ...l, buy_price: 0 })) } as unknown as Record<string, unknown> }));
    data.move = data.move.map((m) => ({ ...m, data: { ...(m.data as unknown as Move), unit_cost: null } as unknown as Record<string, unknown> }));
  } else data.product = data.product.map((d) => ({ ...d, data: { ...d.data, op_keys: [] } }));
  if (!allowed(p, ctx.role, "finances") && !has(p, "rapports")) data.expense = [];
  if (!has(p, ["clients", "caisse", "commandes"])) data.customer = [];
  if (!has(p, ["achats", "stock"])) {
    data.supplier = [];
    data.po = [];
  }
  if (!has(p, ["commandes", "caisse", "rapports"])) data.order = [];
  data.counter = [];
  return NextResponse.json({
    data,
    members: team,
    role: ctx.role,
    me: ctx.profile.id,
    perms: p,
    slug: ctx.project.slug,
    projectName: ctx.project.name,
    truncated: store.truncated,
    zingopay: Boolean(zp?.enabled),
    can: {
      cost: seeCost,
      finances: allowed(p, ctx.role, "finances"),
      remises: allowed(p, ctx.role, "remises"),
      settings: allowed(p, ctx.role, "parametres"),
      team: ctx.role === "owner" || ctx.role === "admin" || (p !== null && p.includes("equipe")),
    },
  });
});

const SENSITIVE = new Set(["sale.cancel", "sale.return", "stock.move", "stock.inventory", "register.close", "product.delete", "expense.delete", "settings.save", "order.status"]);

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z.object({ mode: modeSchema, op: z.string().max(40), input: z.unknown() }).parse(await readJson(req, 700_000));
  const ctx = await shopContext(id, input.mode);
  const store = new SupabaseStore(id, input.mode === "demo", ctx.profile.id);
  try {
    const result = await runOp({ store, actor: { id: ctx.profile.id, role: ctx.role }, perms: ctx.perms }, input.op, input.input);
    if (input.mode === "live" && !result.duplicate) {
      if (SENSITIVE.has(input.op)) {
        const details = input.op === "photo.add" ? {} : { input: input.input as Record<string, unknown> };
        await audit(`shop.${input.op}`, { projectId: id, actorId: ctx.profile.id, level: input.op === "sale.cancel" || input.op === "product.delete" ? "warning" : "info", details });
      }
      const low = result.effects.find((e) => e.type === "low_stock");
      if (low && low.type === "low_stock") {
        const settings = settingsOf((await store.list("settings"))[0]);
        void notifyStaff(id, ["stock"], { type: "info", title: `Stock bas : ${low.names.join(", ")}`.slice(0, 160), body: `${settings.name} : pensez à réapprovisionner.`, link: `/apps/${ctx.project.slug}`, exceptUserId: undefined }).catch(() => undefined);
      }
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
