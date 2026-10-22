import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { adminAudit, assertAdminApi } from "@/lib/admin";
import { notifyUser } from "@/lib/notify";

type Ctx = { params: Promise<{ ticketId: string }> };

async function ticket(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Demande introuvable.");
  const { data } = await adminClient().from("support_tickets").select("id,user_id,subject,status").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Demande introuvable.");
  return data;
}

/** Statut d'une demande : nouveau, en cours, résolu. */
export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const { ticketId } = await params;
  const { status } = z.object({ status: z.enum(["nouveau", "en_cours", "resolu"]) }).parse(await readJson(req));
  const t = await ticket(ticketId);
  await adminClient().from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (status === "resolu" && t.user_id) await notifyUser(t.user_id, { type: "info", title: `Demande résolue : ${t.subject}`, link: "/espace/assistance" });
  await adminAudit(admin, "ticket_status", { ticketId, from: t.status, to: status });
  return NextResponse.json({ ok: true });
});

/** Réponse de l'équipe : visible par le client dans son espace, avec une notification. */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const { ticketId } = await params;
  const { body } = z.object({ body: z.string().trim().min(2, "Réponse trop courte.").max(4000) }).parse(await readJson(req));
  const t = await ticket(ticketId);
  const db = adminClient();
  await db.from("support_messages").insert({ ticket_id: ticketId, author_id: admin.id, from_admin: true, body });
  await db.from("support_tickets").update({ status: t.status === "nouveau" ? "en_cours" : t.status, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (t.user_id) await notifyUser(t.user_id, { type: "info", title: `Réponse à votre demande : ${t.subject}`, body: body.slice(0, 300), link: "/espace/assistance" });
  await adminAudit(admin, "ticket_reply", { ticketId });
  return NextResponse.json({ ok: true });
});
