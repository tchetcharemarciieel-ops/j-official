import { AuthShell } from "@/components/AuthShell";

export const metadata = { title: "Compte suspendu" };

export default function Page() {
  return (
    <AuthShell title="Compte suspendu" subtitle="Votre compte a été suspendu par l'administration de MiniSoft RCA.">
      <p className="text-sm text-slate-700">Vos données sont conservées. Contactez l&apos;équipe MiniSoft RCA pour en connaître la raison et rétablir l&apos;accès.</p>
      <form action="/auth/signout" method="post" className="mt-6">
        <button className="btn btn-ghost w-full">Se déconnecter</button>
      </form>
    </AuthShell>
  );
}
