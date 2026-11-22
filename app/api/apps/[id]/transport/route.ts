import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { appContext, type AppContext } from "@/lib/app-data";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { notifyStaff, notifyUser } from "@/lib/notify";
import { has } from "@/lib/team";
import { OpError, runOp } from "@/lib/transport/engine";
import { SupabaseStore } from "@/lib/transport/supabase-store";
import { fileAllowed, visibleData } from "@/lib/transport/visibility";
import { LEVEL, settingsOf, type Courier, type Doc, type FileDoc, type Order } from "@/lib/transport/model";
import type { Role } from "@/lib/spec";

type Ctx = { params: Promise<{ id: string }> };
const modeSchema = z.enum(["demo", "live"]);

export async function transportContext(id: string, mode: "demo" | "live"): Promise<AppContext> {
  const ctx = await appContext(id, mode);
  if (ctx.spec.module !== "transport") throw new HttpError(404, "Ce logiciel n'est pas un MiniSoft Transport & Delivery.");
  return ctx;
}

export async function members(projectId: string) {
  const db = adminClient();
  const { data: rows } = await db.from("project_members").select("user_id,role,status,position").eq("project_id", projectId).limit(200);
  const ids = (rows ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] as { id: string; full_name: string | null; email: string }[] };
  return (rows ?? []).map((m) => {
    const p = (profiles ?? []).find((x) => x.id === m.user_id);
    return { id: m.user_id as string, name: (p?.full_name?.trim() || p?.email?.split("@")[0] || "Membre").slice(0, 40), role: m.role as Role, position: (m.position as string | null) ?? null, active: m.status !== "suspended" };
  });
}

/** Données visibles par la personne (filtrées côté serveur par rôle et poste). Les photos ne sortent que par `?file=`. */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const url = new URL(req.url);
  const mode = modeSchema.parse(url.searchParams.get("mode") ?? "live");
  const ctx = await transportContext(id, mode);
  const store = new SupabaseStore(id, mode === "demo", ctx.profile.id);
  const fileId = url.searchParams.get("file");
  if (fileId) {
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new HttpError(404, "Fichier introuvable.");
    const settings = settingsOf((await store.list("settings"))[0], ctx.project.name);
    const seen = visibleData(await store.all(), ctx.profile.id, ctx.role, ctx.perms).order as Doc<Order>[];
    if (!fileAllowed(seen, ctx.perms, settings.logo_id, fileId)) throw new HttpError(403, "Ce fichier ne fait pas partie de votre poste.");
    const doc = (await store.file(fileId)) as Doc<FileDoc> | null;
    if (!doc) throw new HttpError(404, "Fichier introuvable.");
    if (!/^image\/(png|jpeg|webp)$/.test(doc.data.mime)) throw new HttpError(404, "Fichier introuvable.");
    return new Response(new Uint8Array(Buffer.from(doc.data.data, "base64")), { headers: { "Content-Type": doc.data.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" } });
  }
  const [all, team] = await Promise.all([store.all(), members(id)]);
  const data = visibleData(all, ctx.profile.id, ctx.role, ctx.perms);
  return NextResponse.json({
    data, members: team, role: ctx.role, me: ctx.profile.id, perms: ctx.perms, slug: ctx.project.slug, projectName: ctx.project.name, truncated: store.truncated,
    can: { manager: LEVEL[ctx.role] >= 2, settings: has(ctx.perms, "parametres"), team: ctx.role === "owner" || ctx.role === "admin" || (ctx.perms !== null && ctx.perms.includes("equipe")), finances: has(ctx.perms, "finances"), dispatch: has(ctx.perms, "livraisons"), couriers: has(ctx.perms, "livreurs"), missions: has(ctx.perms, "missions") },
  });
});

const SENSITIVE = new Set(["order.delete", "order.cancel", "order.payment", "order.payment_confirm", "order.payment_cancel", "courier.delete", "vehicle.delete", "transaction.save", "transaction.delete", "settings.save", "courier.save"]);
const label = (o: Order) => `${o.number} · ${o.recipient.name}`;

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z.object({ mode: modeSchema, op: z.string().max(40), input: z.unknown() }).parse(await readJson(req, 700_000));
  const ctx = await transportContext(id, input.mode);
  const store = new SupabaseStore(id, input.mode === "demo", ctx.profile.id);
  const team = await members(id);
  try {
    const result = await runOp({ store, actor: { id: ctx.profile.id, role: ctx.role }, perms: ctx.perms, members: team.filter((m) => m.active).map((m) => m.id) }, input.op, input.input);
    if (input.mode === "live") {
      if (SENSITIVE.has(input.op)) await audit(`transport.${input.op}`, { projectId: id, actorId: ctx.profile.id, level: /delete|cancel/.test(input.op) ? "warning" : "info", details: { op: input.op, ref: result.id ?? null } });
      // Notifications internes (aucun SMS, WhatsApp ni e-mail n'est envoyé : ces canaux ne sont pas connectés).
      try {
        const ev = result.event;
        if (ev) {
          const o = (await store.get("order", ev.order_id)) as Doc<Order> | null;
          if (o) {
            const link = undefined;
            if (ev.kind === "new") await notifyStaff(id, ["livraisons"], { type: "info", title: `Nouvelle commande ${o.data.number}`, body: `${o.data.sender.name} → ${o.data.recipient.name} · ${o.data.dropoff.address}`.slice(0, 200), link, exceptUserId: ctx.profile.id });
            else if (ev.kind === "assigned" && ev.courier_id) {
              const c = (await store.get("courier", ev.courier_id)) as Doc<Courier> | null;
              if (c?.data.user_id && c.data.user_id !== ctx.profile.id) await notifyUser(c.data.user_id, { type: "info", title: `Nouvelle mission : ${o.data.number}`, body: `${o.data.pickup.address} → ${o.data.dropoff.address}`.slice(0, 200), projectId: id });
            } else {
              const titles = { pickup: "Colis récupéré", en_route: "Livraison en cours", delivered: "Livraison terminée", failed: "Échec de livraison", cancelled: "Commande annulée", problem: "Problème signalé par un livreur" } as const;
              if (ev.kind in titles) await notifyStaff(id, ["livraisons"], { type: ev.kind === "failed" || ev.kind === "problem" ? "error" : "info", title: `${titles[ev.kind as keyof typeof titles]} : ${label(o.data)}`.slice(0, 160), body: o.data.fail_reason || o.data.problem?.note || undefined, link, exceptUserId: ctx.profile.id });
            }
          }
        }
      } catch {
        /* une notification manquée ne doit jamais faire échouer l'opération */
      }
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
