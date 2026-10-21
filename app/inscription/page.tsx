import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { supabaseConfigured } from "@/lib/config";

export const metadata = { title: "Créer un compte" };
export const dynamic = "force-dynamic";

export default function Page() {
  if (!supabaseConfigured()) redirect("/configuration");
  return (
    <AuthShell title="Créer un compte" subtitle="Gratuit, sans carte bancaire.">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthShell>
  );
}
