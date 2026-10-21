import { NextResponse } from "next/server";
import { assertSameOrigin, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { sendWebhook } from "@/lib/webhooks";

type Ctx = { params: Promise<{ id: string; intId: string }> };

/** Test de connexion réel : envoie un événement de test et n'affiche « connecté » qu'en cas de réponse 2xx. */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id, intId } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  const db = adminClient();
  const { data: integ } = await db.from("integrations").select("*").eq("id", intId).eq("project_id", id).maybeSingle();
  if (!integ) throw new HttpError(404, "Intégration introuvable.");
  const result = await sendWebhook(integ.config.url, { type: "test", app: project.slug, message: "Test de connexion MiniSoft RCA", sentAt: new Date().toISOString() });
  await db
    .from("integrations")
    .update({ status: result.ok ? "connected" : "error", last_error: result.ok ? null : result.error, last_tested_at: new Date().toISOString() })
    .eq("id", intId);
  await audit("integration.tested", { projectId: id, actorId: profile.id, level: result.ok ? "info" : "warning", details: { ok: result.ok, error: result.error } });
  return NextResponse.json(result);
});

export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id, intId } = await params;
  const { profile } = await getAccess(id, ["owner", "admin"]);
  await adminClient().from("integrations").delete().eq("id", intId).eq("project_id", id);
  await audit("integration.deleted", { projectId: id, actorId: profile.id });
  return NextResponse.json({ ok: true });
});
