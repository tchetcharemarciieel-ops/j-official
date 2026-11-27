import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { appContext, type AppContext } from "@/lib/app-data";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { has } from "@/lib/team";
import { OpError, runOp } from "@/lib/ecole/engine";
import { SupabaseStore } from "@/lib/ecole/supabase-store";
import { childReports, fileAllowed, isParentOnly, visibleData } from "@/lib/ecole/visibility";
import { LEVEL, settingsOf, type Announcement, type Doc, type FileDoc, type Guardian, type Klass, type Student } from "@/lib/ecole/model";
import type { Role } from "@/lib/spec";

type Ctx = { params: Promise<{ id: string }> };
const modeSchema = z.enum(["demo", "live"]);

export async function ecoleContext(id: string, mode: "demo" | "live"): Promise<AppContext> {
  const ctx = await appContext(id, mode);
  if (ctx.spec.module !== "ecole") throw new HttpError(404, "Ce logiciel n'est pas un MiniSoft École.");
  return ctx;
}

export async function members(projectId: string) {
  const db = adminClient();
  const { data: rows } = await db.from("project_members").select("user_id,role,status,position").eq("project_id", projectId).limit(500);
  const ids = (rows ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] as { id: string; full_name: string | null; email: string }[] };
  return (rows ?? []).map((m) => {
    const p = (profiles ?? []).find((x) => x.id === m.user_id);
    return { id: m.user_id as string, name: (p?.full_name?.trim() || p?.email?.split("@")[0] || "Membre").slice(0, 40), role: m.role as Role, position: (m.position as string | null) ?? null, active: m.status !== "suspended" };
  });
}

/** Données visibles par la personne (filtrées côté serveur par rôle et poste) : un parent ne reçoit que ses enfants. */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const url = new URL(req.url);
  const mode = modeSchema.parse(url.searchParams.get("mode") ?? "live");
  const ctx = await ecoleContext(id, mode);
  const store = new SupabaseStore(id, mode === "demo", ctx.profile.id);
  const fileId = url.searchParams.get("file");
  if (fileId) {
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new HttpError(404, "Fichier introuvable.");
    const settings = settingsOf((await store.list("settings"))[0], ctx.project.name);
    if (!fileAllowed(settings.logo_id, fileId)) throw new HttpError(403, "Ce fichier n'est pas accessible.");
    const doc = (await store.file(fileId)) as Doc<FileDoc> | null;
    if (!doc || !/^image\/(png|jpeg|webp)$/.test(doc.data.mime)) throw new HttpError(404, "Fichier introuvable.");
    return new Response(new Uint8Array(Buffer.from(doc.data.data, "base64")), { headers: { "Content-Type": doc.data.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" } });
  }
  const all = await store.all();
  const data = visibleData(all, ctx.profile.id, ctx.perms);
  const parent = isParentOnly(ctx.perms);
  const manage = has(ctx.perms, ["eleves", "enseignants", "classes"]) && !parent;
  const team = manage ? await members(id) : [];
  return NextResponse.json({
    data, members: team, role: ctx.role, me: ctx.profile.id, perms: ctx.perms, slug: ctx.project.slug, projectName: ctx.project.name, truncated: store.truncated,
    reports: parent ? childReports(all, data.student.map((s) => s.id)) : [],
    can: { manager: LEVEL[ctx.role] >= 2, settings: has(ctx.perms, "parametres"), team: ctx.role === "owner" || ctx.role === "admin" || (ctx.perms !== null && ctx.perms.includes("equipe")), parent, students: has(ctx.perms, "eleves"), classes: has(ctx.perms, "classes"), teachers: has(ctx.perms, "enseignants"), notes: has(ctx.perms, "notes"), bulletins: has(ctx.perms, ["bulletins", "classes"]), presences: has(ctx.perms, "presences"), finances: has(ctx.perms, "finances"), announcements: has(ctx.perms, "annonces") },
  });
});

const SENSITIVE = new Set(["student.delete", "student.status", "student.move", "exam.delete", "grades.save", "payment.add", "payment.cancel", "invoice.discount", "fee.save", "fee.delete", "transaction.save", "transaction.delete", "settings.save", "teacher.delete", "class.delete", "year.delete", "year.current"]);

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const input = z.object({ mode: modeSchema, op: z.string().max(40), input: z.unknown() }).parse(await readJson(req, 300_000));
  const ctx = await ecoleContext(id, input.mode);
  const store = new SupabaseStore(id, input.mode === "demo", ctx.profile.id);
  const team = await members(id);
  try {
    const result = await runOp({ store, actor: { id: ctx.profile.id, role: ctx.role }, perms: ctx.perms, members: team.filter((m) => m.active).map((m) => m.id) }, input.op, input.input);
    if (input.mode === "live") {
      if (SENSITIVE.has(input.op)) await audit(`ecole.${input.op}`, { projectId: id, actorId: ctx.profile.id, level: /delete|cancel/.test(input.op) ? "warning" : "info", details: { op: input.op, ref: result.id ?? null } });
      // Notifications internes aux parents (aucun SMS ni e-mail n'est envoyé : ces canaux ne sont pas connectés).
      try {
        const ev = result.event;
        if (ev?.kind === "absence") {
          const guardians = (await store.list("guardian")) as Doc<Guardian>[];
          const students = (await store.list("student")) as Doc<Student>[];
          const klass = (await store.get("class", ev.class_id)) as Doc<Klass> | null;
          for (const sid of ev.student_ids) {
            const st = students.find((x) => x.id === sid);
            if (!st) continue;
            for (const g of guardians.filter((x) => x.data.student_ids.includes(sid) && x.data.user_id))
              await notifyUser(g.data.user_id!, { type: "info", title: `${st.data.first_name} : absence ou retard le ${new Date(ev.date).toLocaleDateString("fr-FR")}`, body: klass ? `Classe ${klass.data.name}` : undefined, projectId: id });
          }
        } else if (ev?.kind === "announcement") {
          const a = (await store.get("announcement", ev.id)) as Doc<Announcement> | null;
          if (a && (a.data.audience === "tous" || a.data.audience === "parents")) {
            const guardians = (await store.list("guardian")) as Doc<Guardian>[];
            const students = (await store.list("student")) as Doc<Student>[];
            const ids = new Set(guardians.filter((g) => g.data.user_id && (!a.data.class_id || g.data.student_ids.some((sid) => students.find((s) => s.id === sid)?.data.class_id === a.data.class_id))).map((g) => g.data.user_id!));
            for (const uid of ids) await notifyUser(uid, { type: "info", title: `Annonce : ${a.data.title}`.slice(0, 160), body: a.data.body.slice(0, 200), projectId: id });
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
