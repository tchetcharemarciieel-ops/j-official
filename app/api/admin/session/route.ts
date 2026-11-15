import { clientIp } from "@/lib/client-ip";
import { NextResponse } from "next/server";
import { assertSameOrigin, route } from "@/lib/api";
import { adminAudit, assertAdminApi } from "@/lib/admin";

/** Journalise l'ouverture d'une session administrateur vérifiée (aal2). */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  await adminAudit(admin, "login", { ip: clientIp(req), agent: (req.headers.get("user-agent") ?? "").slice(0, 160) });
  return NextResponse.json({ ok: true });
});
