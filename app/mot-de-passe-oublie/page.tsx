import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { serverConfigured } from "@/lib/config";

export const metadata = { title: "Mot de passe oublié" };
export const dynamic = "force-dynamic";

export default function Page() {
  if (!serverConfigured()) redirect("/configuration");
  return (
    <AuthShell title="Mot de passe oublié" subtitle="Recevez un lien de réinitialisation par e-mail.">
      <Suspense>
        <AuthForm mode="forgot" />
      </Suspense>
    </AuthShell>
  );
}
