import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { serverConfigured } from "@/lib/config";
import { getProfile } from "@/lib/auth";

export const metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!serverConfigured()) redirect("/configuration");
  // Déjà connecté : on le dit et on propose de changer de compte (pas de redirection silencieuse).
  const profile = await getProfile().catch(() => null);
  if (profile) {
    const { next } = await searchParams;
    const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/espace";
    return (
      <AuthShell title="Vous êtes déjà connecté" subtitle={`Compte actuel : ${profile.email}`}>
        <div className="flex flex-col gap-3">
          <Link href={target} className="btn btn-primary w-full">Continuer vers mon espace</Link>
          <form action="/auth/signout" method="post">
            <input type="hidden" name="next" value="/connexion" />
            <button type="submit" className="btn btn-ghost w-full">Se déconnecter et changer de compte</button>
          </form>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Connexion" subtitle="Accédez à vos mini-logiciels.">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
