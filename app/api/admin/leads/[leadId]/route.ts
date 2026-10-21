import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ leadId: string }> };

export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const admin = await getProfile();
  if (!admin?.is_admin) throw new HttpError(404, "Introuvable.");
  const { leadId } = await params;
  const { status } = z.object({ status: z.enum(["nouveau", "contacte", "client", "sans_suite"]) }).parse(await readJson(req));
  await adminClient().from("leads").update({ status }).eq("id", leadId);
  return NextResponse.json({ ok: true });
});
