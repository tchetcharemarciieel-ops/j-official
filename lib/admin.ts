import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { getProfile, requireProfile, type Profile } from "./auth";
import { HttpError } from "./access";
import { audit } from "./audit";

/**
 * Accès à l'espace administrateur de la plateforme.
 * 1. Seuls les comptes listés dans ADMIN_EMAILS (variable d'environnement du serveur) sont propriétaires.
 * 2. Authentification renforcée : session de niveau aal2 (mot de passe + code à 6 chiffres TOTP).
 * Les pages vérifient ces deux points côté serveur, et chaque route /api/admin aussi :
 * masquer un bouton ou deviner l'adresse /admin ne donne aucun accès.
 */
export function ownerEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformOwner(profile: Pick<Profile, "email"> | null | undefined): boolean {
  return Boolean(profile && ownerEmails().includes(String(profile.email).toLowerCase()));
}

export type MfaState = { current: string | null; next: string | null };

export async function mfaState(): Promise<MfaState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { current: data?.currentLevel ?? null, next: data?.nextLevel ?? null };
}

/** Garde des pages /admin : 404 pour tout autre compte, puis étape de vérification renforcée. */
export async function requirePlatformAdmin(): Promise<Profile> {
  const profile = await requireProfile("/admin");
  if (!isPlatformOwner(profile)) notFound();
  const mfa = await mfaState();
  if (mfa.current !== "aal2") redirect(mfa.next === "aal2" ? "/admin/verification" : "/admin/securite");
  return profile;
}

/** Garde des routes /api/admin : mêmes vérifications, réponse 404/403 sans détail. */
export async function assertAdminApi(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile || profile.suspended || !isPlatformOwner(profile)) throw new HttpError(404, "Introuvable.");
  const mfa = await mfaState();
  if (mfa.current !== "aal2") throw new HttpError(403, "Vérification renforcée requise : saisissez votre code de sécurité.");
  return profile;
}

/** Journal des actions administratives (table audit_logs, préfixe admin.). */
export async function adminAudit(admin: Profile, action: string, details: Record<string, unknown> = {}, projectId?: string | null) {
  await audit(`admin.${action}`, { actorId: admin.id, projectId: projectId ?? null, details: { by: admin.email, ...details } });
}
