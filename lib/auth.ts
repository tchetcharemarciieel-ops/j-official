import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { adminClient } from "./supabase/admin";
import { serverConfigured } from "./config";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  plan: string;
  credits: number;
  is_admin: boolean;
  suspended: boolean;
  company_name: string;
  company_logo_url: string;
  company_sector: string;
  company_phone: string;
  company_email: string;
  company_address: string;
};

export async function getUser() {
  // Sans la clé serveur, aucune session n'est exploitable : on traite le visiteur comme déconnecté.
  if (!serverConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** Mis en cache le temps d'une requête : la mise en page et la page partagent le même profil. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const { data } = await adminClient().from("profiles").select("id,email,full_name,plan,credits,is_admin,suspended,company_name,company_logo_url,company_sector,company_phone,company_email,company_address").eq("id", user.id).maybeSingle();
  if (!data) return null;
  // Les administrateurs sont désignés par variable d'environnement (jamais depuis le navigateur).
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { ...(data as Profile), is_admin: Boolean(data.is_admin) || admins.includes(String(data.email).toLowerCase()) };
});

export async function requireProfile(next = "/espace"): Promise<Profile> {
  if (!serverConfigured()) redirect("/configuration");
  const profile = await getProfile();
  if (!profile) redirect(`/connexion?next=${encodeURIComponent(next)}`);
  if (profile.suspended) redirect("/compte-suspendu");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile("/admin");
  if (!profile.is_admin) redirect("/espace");
  return profile;
}
