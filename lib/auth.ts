import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { adminClient } from "./supabase/admin";
import { supabaseConfigured } from "./config";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  plan: string;
  credits: number;
  is_admin: boolean;
  suspended: boolean;
};

export async function getUser() {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getProfile(): Promise<Profile | null> {
  const user = await getUser();
  if (!user) return null;
  const { data } = await adminClient().from("profiles").select("id,email,full_name,plan,credits,is_admin,suspended").eq("id", user.id).maybeSingle();
  if (!data) return null;
  // Les administrateurs sont désignés par variable d'environnement (jamais depuis le navigateur).
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { ...(data as Profile), is_admin: Boolean(data.is_admin) || admins.includes(String(data.email).toLowerCase()) };
}

export async function requireProfile(next = "/espace"): Promise<Profile> {
  if (!supabaseConfigured()) redirect("/configuration");
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
