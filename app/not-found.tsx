import Link from "next/link";

export default function NotFound() {
  return (
    <main className="bg-aurora grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="font-display text-6xl font-bold text-gradient">404</p>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Page introuvable</h1>
        <p className="mt-2 text-sm text-slate-600">Ce lien n&apos;existe pas ou vous n&apos;y avez pas accès.</p>
        <Link href="/" className="btn btn-primary mt-6">Retour à l&apos;accueil</Link>
      </div>
    </main>
  );
}
