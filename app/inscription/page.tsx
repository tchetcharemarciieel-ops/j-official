import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { serverConfigured } from "@/lib/config";
import { getProfile } from "@/lib/auth";

export const metadata = { title: "Créer un compte" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!serverConfigured()) redirect("/configuration");
  // Déjà connecté : on le dit clairement au lieu de renvoyer en silence vers l'espace client.
  const profile = await getProfile().catch(() => null);
  if (profile) {
    const { next } = await searchParams;
    const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/espace";
    return (
      <AuthShell title="Vous êtes déjà connecté" subtitle={`Compte actuel : ${profile.email}`}>
        <p className="text-sm text-slate-600">Pour créer un nouveau compte avec une autre adresse e-mail, déconnectez-vous d&apos;abord.</p>
        <div className="mt-6 flex flex-col gap-3">
          <form action="/auth/signout" method="post">
            <input type="hidden" name="next" value="/inscription" />
            <button type="submit" className="btn btn-primary w-full">Me déconnecter et créer un compte</button>
          </form>
          <Link href={target} className="btn btn-ghost w-full">Continuer vers mon espace</Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Créer un compte" subtitle="Gratuit, sans carte bancaire.">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthShell>
  );
}
