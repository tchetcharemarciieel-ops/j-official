import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";
import { adminAudit, assertAdminApi } from "@/lib/admin";

/**
 * Sauvegarde complète de la plateforme au format JSON (téléchargement).
 * Les clés API chiffrées ne sont jamais incluses.
 */
export const GET = route(async () => {
  const admin = await assertAdminApi();
  const db = adminClient();
  const tables = ["profiles", "plans", "projects", "project_members", "project_versions", "records", "backups", "integrations", "subscriptions", "payments", "support_tickets", "support_messages", "leads", "platform_settings"] as const;
  const out: Record<string, unknown[]> = {};
  for (const t of tables) {
    const { data, error } = await db.from(t).select("*").limit(50000);
    if (error) out[t] = [];
    else out[t] = t === "platform_settings" ? (data ?? []).map((r) => (r.key === "ai" ? { ...r, value: { ...r.value, keys: {} } } : r)) : (data ?? []);
  }
  await adminAudit(admin, "backup_exported", { counts: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])) });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return new NextResponse(JSON.stringify({ format: "minisoft-rca-backup-v1", exportedAt: new Date().toISOString(), tables: out }), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="minisoft-rca-sauvegarde-${stamp}.json"`, "cache-control": "no-store" },
  });
});
