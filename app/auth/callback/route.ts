import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Retour des liens e-mail Supabase (confirmation d'inscription, réinitialisation). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/espace";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/espace";
  // Lien expiré ou déjà utilisé : Supabase revient avec une erreur au lieu d'un code.
  if (!code) return NextResponse.redirect(new URL(`/connexion?erreur=${url.searchParams.get("error_code") === "otp_expired" ? "expire" : "lien"}`, url.origin));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return NextResponse.redirect(new URL(next, url.origin));
  // Lien ouvert dans un autre navigateur que celui de l'inscription : l'adresse est confirmée
  // par Supabase, mais la session ne peut pas s'ouvrir ici. On invite à se connecter.
  return NextResponse.redirect(new URL(`/connexion?info=confirme&next=${encodeURIComponent(next)}`, url.origin));
}
