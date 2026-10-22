import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { adminAudit, assertAdminApi, isPlatformOwner } from "@/lib/admin";
import { notifyUser } from "@/lib/notify";

type Ctx = { params: Promise<{ userId: string }> };

async function target(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new HttpError(404, "Utilisateur introuvable.");
  const { data } = await adminClient().from("profiles").select("id,email,plan,suspended").eq("id", userId).maybeSingle();
  if (!data) throw new HttpError(404, "Utilisateur introuvable.");
  return data;
}

/** Formule, crédits et suspension d'un compte (chaque changement est journalisé). */
export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const { userId } = await params;
  const input = z
    .object({
      plan: z.string().max(40).optional(),
      credits: z.number().int().min(0).max(1_000_000).optional(),
      suspended: z.boolean().optional(),
      reason: z.string().trim().max(300).optional(),
    })
    .parse(await readJson(req));
  const user = await target(userId);
  if (input.suspended && isPlatformOwner(user)) throw new HttpError(400, "Un compte propriétaire de la plateforme ne peut pas être suspendu.");
  const db = adminClient();
  const update: Record<string, unknown> = {};
  if (input.plan !== undefined && input.plan !== user.plan) {
    const { data: plan } = await db.from("plans").select("id,name,monthly_credits").eq("id", input.plan).maybeSingle();
    if (!plan) throw new HttpError(400, "Formule inconnue.");
    update.plan = plan.id;
    if (input.credits === undefined) update.credits = plan.monthly_credits;
    // Historique : l'abonnement en cours est clos, le nouveau est attribué manuellement (sans paiement).
    await db.from("subscriptions").update({ status: "canceled", ends_at: new Date().toISOString() }).eq("user_id", userId).eq("status", "active");
    await db.from("subscriptions").insert({ user_id: userId, plan_id: plan.id, status: "active", source: "manuel", created_by: admin.id });
    await notifyUser(userId, { type: "info", title: `Votre formule est maintenant « ${plan.name} »`, body: "Modification effectuée par l'équipe MiniSoft RCA.", link: "/espace/abonnement" });
  }
  if (input.credits !== undefined) update.credits = input.credits;
  if (input.suspended !== undefined) {
    update.suspended = input.suspended;
    update.suspended_reason = input.suspended ? input.reason || "Non précisé" : null;
  }
  if (Object.keys(update).length) {
    const { error } = await db.from("profiles").update(update).eq("id", userId);
    if (error) throw new HttpError(400, "Mise à jour impossible.");
  }
  await adminAudit(admin, input.suspended === true ? "user_suspended" : input.suspended === false ? "user_reactivated" : "user_updated", { userId, email: user.email, ...input });
  return NextResponse.json({ ok: true });
});

/**
 * Suppression définitive d'un compte : confirmation par saisie de l'adresse e-mail,
 * impossible pour un compte propriétaire. Les logiciels dont il est propriétaire sont supprimés avec lui.
 */
export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const { userId } = await params;
  const { confirm } = z.object({ confirm: z.string().trim().toLowerCase() }).parse(await readJson(req));
  const user = await target(userId);
  if (isPlatformOwner(user) || userId === admin.id) throw new HttpError(400, "Un compte propriétaire de la plateforme ne peut pas être supprimé ici.");
  if (confirm !== String(user.email).toLowerCase()) throw new HttpError(400, "Saisissez exactement l'adresse e-mail du compte pour confirmer.");
  const db = adminClient();
  const { count } = await db.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", userId);
  await adminAudit(admin, "user_deleted", { userId, email: user.email, projectsDeleted: count ?? 0 });
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new HttpError(500, "Suppression impossible. Réessayez.");
  return NextResponse.json({ ok: true });
});
