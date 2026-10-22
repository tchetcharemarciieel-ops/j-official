import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { serverConfigured } from "@/lib/config";
import { getProfile } from "@/lib/auth";

export const metadata = { title: "Créer un compte" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!serverConfigured()) redirect("/configuration");
  // Déjà connecté : on va directement à la page demandée ou à l'espace client.
  if (await getProfile().catch(() => null)) {
    const { next } = await searchParams;
    redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/espace");
  }
  return (
    <AuthShell title="Créer un compte" subtitle="Gratuit, sans carte bancaire.">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthShell>
  );
}
