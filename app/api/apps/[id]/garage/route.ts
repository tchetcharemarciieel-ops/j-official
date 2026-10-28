import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { appContext, type AppContext } from "@/lib/app-data";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { effectiveWorkspace } from "@/lib/workspace";
import { LEVEL } from "@/lib/garage/model";
import { OpError, runOp } from "@/lib/garage/engine";
import { SupabaseStore } from "@/lib/garage/supabase-store";
import type { Role } from "@/lib/spec";

type Ctx = { params: Promise<{ id: string }> };
const modeSchema = z.enum(["demo", "live"]);

/** Le module garage n'existe que pour les logiciels dont l'espace de travail est un garage. */
async function garageContext(id: string, mode: "demo" | "live"): Promise<AppContext> {
  const ctx = await appContext(id, mode);
  if (effectiveWorkspace(ctx.spec).layout !== "garage") throw new HttpError(404, "Ce logiciel n'a pas de module garage.");
  return ctx;
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

/** Données du garage lisibles par le rôle ; les dépenses sont réservées aux gérants. */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const url = new URL(req.url);
  const mode = modeSchema.parse(url.searchParams.get("mode") ?? "live");
  const ctx = await garageContext(id, mode);
  const store = new SupabaseStore(id, mode === "demo", ctx.profile.id);
  const photosFor = url.searchParams.get("photos");
  if (photosFor) return NextResponse.json({ photos: await store.photos(photosFor) });
  const [data, team] = await Promise.all([store.all(), members(id)]);
  if (LEVEL[ctx.role] < 2) data.expense = [];
  return NextResponse.json({ data, members: team, role: ctx.role, me: ctx.profile.id });
});

const SENSITIVE = new Set(["payment.cancel", "invoice.cancel", "stock.adjust", "expense.delete", "job.part.remove"]);

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z.object({ mode: modeSchema, op: z.string().max(40), input: z.unknown() }).parse(await readJson(req, 600_000));
  const ctx = await garageContext(id, input.mode);
  const team = await members(id);
  try {
    const result = await runOp({ store: new SupabaseStore(id, input.mode === "demo", ctx.profile.id), actor: { id: ctx.profile.id, role: ctx.role }, members: team.map((m) => m.id) }, input.op, input.input);
    if (input.mode === "live") {
      if (SENSITIVE.has(input.op)) await audit(`garage.${input.op}`, { projectId: id, actorId: ctx.profile.id, level: "warning", details: { input: input.input as Record<string, unknown> } });
      // Véhicule prêt : toute l'équipe (dont l'accueil) est prévenue, sauf l'auteur de la validation.
      const ready = result.effects.filter((e) => e.type === "ready");
      if (ready.length) {
        const rows = team
          .filter((m) => m.id !== ctx.profile.id)
          .flatMap((m) => ready.map((e) => ({ user_id: m.id, project_id: id, type: "info", title: `Véhicule prêt : ${e.plate || e.ref}`.slice(0, 160), body: `Le dossier ${e.ref} a passé le contrôle qualité. Le client peut être prévenu.`, link: `/apps/${ctx.project.slug}` })));
        // Une notification manquée ne doit jamais faire échouer la validation elle-même.
        if (rows.length) await adminClient().from("notifications").insert(rows).then(() => undefined, () => undefined);
      }
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
