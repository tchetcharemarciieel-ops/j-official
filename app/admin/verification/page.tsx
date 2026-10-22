import { notFound, redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { MfaVerify } from "@/components/admin/Mfa";
import { requireProfile } from "@/lib/auth";
import { isPlatformOwner, mfaState } from "@/lib/admin";

export const metadata = { title: "Vérification administrateur", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Connexion administrateur distincte : mot de passe puis code de sécurité. */
export default async function Page() {
  const profile = await requireProfile("/admin");
  if (!isPlatformOwner(profile)) notFound();
  const mfa = await mfaState();
  if (mfa.current === "aal2") redirect("/admin");
  if (mfa.next !== "aal2") redirect("/admin/securite");
  return (
    <AuthShell title="Vérification administrateur" subtitle={`Connecté en tant que ${profile.email}`}>
      <MfaVerify />
    </AuthShell>
  );
}
