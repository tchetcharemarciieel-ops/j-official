import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { serverConfigured } from "@/lib/config";

export const metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default function Page() {
  if (!serverConfigured()) redirect("/configuration");
  return (
    <AuthShell title="Connexion" subtitle="Accédez à vos mini-logiciels.">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
