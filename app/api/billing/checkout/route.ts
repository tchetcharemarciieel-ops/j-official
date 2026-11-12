import { NextResponse } from "next/server";
import { assertSameOrigin, route } from "@/lib/api";
import { getProfile } from "@/lib/auth";
import { billingEnabled, startPlanCheckout } from "@/lib/billing";
import { SasPayError } from "@/lib/saspay";
import { clientIp, limited } from "@/lib/venue/public";
import { siteOrigin } from "@/lib/site-origin";

/**
 * Bouton « Payer » d'une formule (formulaire de la page Abonnement) : crée la session de paiement
 * SasPay au nom du client connecté puis l'y redirige. En cas d'erreur, retour sur la page avec
 * un message lisible.
 */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const origin = siteOrigin(req);
  const back = (msg: string) => NextResponse.redirect(`${origin}/espace/abonnement?erreur=${encodeURIComponent(msg)}`, 303);
  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(`${origin}/connexion?next=${encodeURIComponent("/espace/abonnement")}`, 303);
  if (profile.suspended) return back("Compte suspendu.");
  if (!billingEnabled()) return back("Le paiement en ligne n'est pas encore activé. Utilisez le lien de paiement ou contactez l'assistance.");
  if (limited(`billing:${profile.id}`, 10) || limited(`billing-ip:${clientIp(req)}`, 30)) return back("Trop de tentatives : réessayez dans une minute.");
  const form = await req.formData().catch(() => null);
  const plan = String(form?.get("plan") ?? "").slice(0, 40);
  if (!/^[a-z0-9_-]{2,40}$/.test(plan)) return back("Formule invalide.");
  if (plan === profile.plan) return back("C'est déjà votre formule actuelle.");
  try {
    const url = await startPlanCheckout(profile, plan, origin);
    return NextResponse.redirect(url, 303);
  } catch (e) {
    return back(e instanceof SasPayError ? e.message : "Paiement impossible pour le moment. Réessayez.");
  }
});
