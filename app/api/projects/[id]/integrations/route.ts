import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { assertPublicUrl } from "@/lib/webhooks";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile } = await getAccess(id, ["owner", "admin"]);
  const input = z.object({ label: z.string().trim().min(2).max(60), url: z.string().url().startsWith("https://", "Adresse https:// obligatoire").max(500) }).parse(await readJson(req));
  await assertPublicUrl(input.url);
  const db = adminClient();
  const { count } = await db.from("integrations").select("id", { count: "exact", head: true }).eq("project_id", id);
  if ((count ?? 0) >= 10) throw new HttpError(400, "10 intégrations maximum par logiciel.");
  const { data, error } = await db.from("integrations").insert({ project_id: id, type: "webhook", label: input.label, config: { url: input.url } }).select("id").single();
  if (error) throw new HttpError(500, "Création impossible.");
  await audit("integration.created", { projectId: id, actorId: profile.id, details: { label: input.label } });
  return NextResponse.json({ id: data.id });
});
