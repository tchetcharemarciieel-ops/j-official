"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/fetcher";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300">En acceptant, vous aurez accès à ce logiciel avec le rôle choisi par son propriétaire.</p>
      {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
      <button
        className="btn btn-primary w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await api<{ slug: string }>("/api/invitations/accept", { body: { token } });
            router.replace(`/apps/${r.slug}`);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Erreur");
            setBusy(false);
          }
        }}
      >
        {busy && <span className="spinner" />}Accepter l&apos;invitation
      </button>
      <form action="/auth/signout" method="post">
        <button className="w-full text-center text-sm text-slate-400 underline">Utiliser un autre compte</button>
      </form>
    </div>
  );
}
