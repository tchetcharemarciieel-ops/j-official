import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Déconnexion : fermeture de la session côté Supabase puis suppression explicite des cookies
 * de session (« sb-… »), même si Supabase ne répond pas : l'appareil est toujours déconnecté.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  try {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* Supabase injoignable : les cookies sont supprimés ci-dessous */
  }
  // Page de retour facultative (chemin interne uniquement), par exemple /inscription.
  const next = String(form?.get("next") ?? "/connexion?info=deconnecte");
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/connexion?info=deconnecte";
  const res = NextResponse.redirect(new URL(target, request.url), { status: 303 });
  for (const c of (await cookies()).getAll()) if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { path: "/", maxAge: 0 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
