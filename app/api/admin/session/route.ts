import { NextResponse } from "next/server";
import { assertSameOrigin, route } from "@/lib/api";
import { adminAudit, assertAdminApi } from "@/lib/admin";

/** Journalise l'ouverture d'une session administrateur vérifiée (aal2). */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  await adminAudit(admin, "login", { ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "", agent: (req.headers.get("user-agent") ?? "").slice(0, 160) });
  return NextResponse.json({ ok: true });
});
