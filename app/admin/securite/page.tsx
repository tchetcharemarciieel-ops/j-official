import { notFound, redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { MfaEnroll } from "@/components/admin/Mfa";
import { requireProfile } from "@/lib/auth";
import { isPlatformOwner, mfaState } from "@/lib/admin";

export const metadata = { title: "Sécurité administrateur", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Activation de la double authentification, obligatoire pour l'administration. */
export default async function Page() {
  const profile = await requireProfile("/admin");
  if (!isPlatformOwner(profile)) notFound();
  const mfa = await mfaState();
  if (mfa.current === "aal2") redirect("/admin");
  if (mfa.next === "aal2") redirect("/admin/verification");
  return (
    <AuthShell title="Activer la double authentification" subtitle="Obligatoire pour accéder à l'administration de MiniSoft RCA.">
      <MfaEnroll />
    </AuthShell>
  );
}
