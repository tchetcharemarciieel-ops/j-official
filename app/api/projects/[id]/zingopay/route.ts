import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { audit } from "@/lib/audit";
import { adminClient } from "@/lib/supabase/admin";
import { KEY_RE, keyHint, seal, zp, zpConfig, ZpError } from "@/lib/zingopay";

type Ctx = { params: Promise<{ id: string }> };

/** Paramétrage du paiement : propriétaire, administrateur, responsable, ou poste avec « Paramètres ». */
async function manager(id: string) {
  const a = await getAccess(id);
  const ok = a.role === "owner" || a.role === "admin" || (a.perms ? a.perms.includes("parametres") : a.role === "manager");
  if (!ok) throw new HttpError(403, "Seul un responsable du restaurant peut régler le paiement ZingoPay.");
  return a;
}

const view = async (id: string, slug: string | null) => {
  const c = await zpConfig(id);
  return { configured: Boolean(c), enabled: c?.enabled ?? false, mode: c?.mode ?? null, hint: c?.hint ?? null, signed: Boolean(c?.webhookSecret), updatedAt: c?.updatedAt ?? null, webhookPath: slug ? `/api/webhooks/zingopay/${slug}` : null };
};

/** État du paiement ZingoPay du restaurant (jamais la clé elle-même). */
export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const { project } = await manager(id);
  return NextResponse.json(await view(id, project.slug ?? null));
});

const putSchema = z.object({
  apiKey: z.string().trim().max(200).optional(),
  webhookSecret: z.string().trim().max(200).optional(),
  enabled: z.boolean(),
});

/**
 * Enregistre la clé secrète du restaurant (vérifiée auprès de ZingoPay avant d'être gardée),
 * le secret de signature des notifications et l'activation sur le menu.
 */
export const PUT = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { project, profile } = await manager(id);
  const input = putSchema.parse(await readJson(req, 4_000));
  const cur = await zpConfig(id);
  const apiKey = input.apiKey || cur?.apiKey;
  if (!apiKey) throw new HttpError(422, "Collez la clé secrète ZingoPay du restaurant.");
  if (!KEY_RE.test(apiKey)) throw new HttpError(422, "Clé non reconnue : elle commence par zp_test_ (démonstration) ou zp_live_.");
  if (input.apiKey) {
    try {
      await zp.check(apiKey);
    } catch (e) {
      throw new HttpError(e instanceof ZpError && e.status === 401 ? 422 : 502, e instanceof Error ? e.message : "ZingoPay injoignable.");
    }
  }
  const secret = input.webhookSecret === undefined ? cur?.webhookSecret ?? null : input.webhookSecret || null;
  const { error } = await adminClient().from("payment_providers").upsert({
    project_id: id,
    provider: "zingopay",
    mode: apiKey.startsWith("zp_live_") ? "live" : "test",
    api_key_enc: seal(apiKey),
    webhook_secret_enc: secret ? seal(secret) : null,
    key_hint: keyHint(apiKey),
    enabled: input.enabled,
    updated_by: profile.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new HttpError(500, "Enregistrement impossible.");
  await audit("zingopay.configured", { projectId: id, actorId: profile.id, details: { mode: apiKey.startsWith("zp_live_") ? "live" : "test", enabled: input.enabled, keyChanged: Boolean(input.apiKey), signed: Boolean(secret) } });
  return NextResponse.json(await view(id, project.slug ?? null));
});

/** Retire la clé : le menu ne propose plus ZingoPay (les paiements déjà confirmés restent). */
export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { project, profile } = await manager(id);
  await adminClient().from("payment_providers").delete().eq("project_id", id).eq("provider", "zingopay");
  await audit("zingopay.removed", { projectId: id, actorId: profile.id, level: "warning" });
  return NextResponse.json(await view(id, project.slug ?? null));
});
