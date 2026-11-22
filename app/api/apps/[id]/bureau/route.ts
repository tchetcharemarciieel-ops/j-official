import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { appContext, type AppContext } from "@/lib/app-data";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { has } from "@/lib/team";
import { OpError, runOp } from "@/lib/bureau/engine";
import { SupabaseStore } from "@/lib/bureau/supabase-store";
import { fileAllowed, visibleData } from "@/lib/bureau/visibility";
import { LEVEL, settingsOf, type Doc, type FileDoc, type Task, type Appointment } from "@/lib/bureau/model";
import type { Role } from "@/lib/spec";

type Ctx = { params: Promise<{ id: string }> };
const modeSchema = z.enum(["demo", "live"]);

/** Le module bureau n'existe que pour les logiciels MiniSoft Bureau. */
export async function bureauContext(id: string, mode: "demo" | "live"): Promise<AppContext> {
  const ctx = await appContext(id, mode);
  if (ctx.spec.module !== "bureau") throw new HttpError(404, "Ce logiciel n'est pas un bureau MiniSoft Bureau.");
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

/**
 * Données du bureau visibles par la personne : le serveur filtre selon son rôle et son poste
 * (projets et tâches de l'employé, messagerie privée, finances…). Les fichiers ne sortent que par `?file=`.
 */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const url = new URL(req.url);
  const mode = modeSchema.parse(url.searchParams.get("mode") ?? "live");
  const ctx = await bureauContext(id, mode);
  const store = new SupabaseStore(id, mode === "demo", ctx.profile.id);
  const fileId = url.searchParams.get("file");
  if (fileId) {
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new HttpError(404, "Fichier introuvable.");
    const settings = settingsOf((await store.list("settings"))[0], ctx.project.name);
    if (!fileAllowed(ctx.perms, settings.logo_id, fileId)) throw new HttpError(403, "Ce fichier ne fait pas partie de votre poste.");
    const doc = (await store.file(fileId)) as Doc<FileDoc> | null;
    if (!doc) throw new HttpError(404, "Fichier introuvable.");
    const safe = doc.data.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    const inline = /^(application\/pdf|image\/)/.test(doc.data.mime);
    return new Response(new Uint8Array(Buffer.from(doc.data.data, "base64")), { headers: { "Content-Type": doc.data.mime, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safe}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" } });
  }
  const [all, team] = await Promise.all([store.all(), members(id)]);
  const data = visibleData(all, ctx.profile.id, ctx.role, ctx.perms);
  return NextResponse.json({
    data,
    members: team,
    role: ctx.role,
    me: ctx.profile.id,
    perms: ctx.perms,
    slug: ctx.project.slug,
    projectName: ctx.project.name,
    truncated: store.truncated,
    can: { manager: LEVEL[ctx.role] >= 2, settings: has(ctx.perms, "parametres"), team: ctx.role === "owner" || ctx.role === "admin" || (ctx.perms !== null && ctx.perms.includes("equipe")), finances: has(ctx.perms, "finances"), people: has(ctx.perms, "personnel") },
  });
});

const SENSITIVE = new Set(["project.delete", "client.delete", "employee.delete", "invoice.status", "invoice.payment", "invoice.payment_cancel", "invoice.delete", "contract.delete", "document.delete", "transaction.delete", "transaction.save", "settings.save", "attendance.delete"]);

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z.object({ mode: modeSchema, op: z.string().max(40), input: z.unknown() }).parse(await readJson(req, 700_000));
  const ctx = await bureauContext(id, input.mode);
  const store = new SupabaseStore(id, input.mode === "demo", ctx.profile.id);
  const team = await members(id);
  try {
    const result = await runOp({ store, actor: { id: ctx.profile.id, role: ctx.role }, perms: ctx.perms, members: team.filter((m) => m.active).map((m) => m.id) }, input.op, input.input);
    if (input.mode === "live") {
      if (SENSITIVE.has(input.op)) await audit(`bureau.${input.op}`, { projectId: id, actorId: ctx.profile.id, level: /delete|cancel/.test(input.op) ? "warning" : "info", details: input.op === "document.add" ? {} : { input: input.input as Record<string, unknown> } });
      // Notifications : tâche confiée, rendez-vous avec participants (jamais à soi-même).
      try {
        if ((input.op === "task.save" || input.op === "task.status") && result.id) {
          const t = (await store.get("task", result.id)) as Doc<Task> | null;
          if (t?.data.assignee && t.data.assignee !== ctx.profile.id && input.op === "task.save") await notifyUser(t.data.assignee, { type: "info", title: `Nouvelle tâche : ${t.data.title}`.slice(0, 160), body: t.data.due ? `À faire avant le ${t.data.due}.` : undefined, projectId: id, link: `/apps/${ctx.project.slug}` });
        }
        if (input.op === "appointment.save" && result.id) {
          const a = (await store.get("appointment", result.id)) as Doc<Appointment> | null;
          for (const p of a?.data.participants ?? []) if (p !== ctx.profile.id) await notifyUser(p, { type: "info", title: `Rendez-vous : ${a!.data.title}`.slice(0, 160), body: `${a!.data.start.replace("T", " à ")}`, projectId: id, link: `/apps/${ctx.project.slug}` });
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
