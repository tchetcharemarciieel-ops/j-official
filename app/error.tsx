"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="bg-aurora grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-slate-600">Rien n&apos;a été perdu. Réessayez dans un instant.</p>
        <button onClick={reset} className="btn btn-primary mt-6">Réessayer</button>
      </div>
    </main>
  );
}
