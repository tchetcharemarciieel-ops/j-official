import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { serverConfigured } from "@/lib/config";

export const metadata = { title: "Nouveau mot de passe" };
export const dynamic = "force-dynamic";

export default function Page() {
  if (!serverConfigured()) redirect("/configuration");
  return (
    <AuthShell title="Nouveau mot de passe" subtitle="Choisissez un mot de passe d'au moins 8 caractères.">
      <Suspense>
        <AuthForm mode="reset" />
      </Suspense>
    </AuthShell>
  );
}
