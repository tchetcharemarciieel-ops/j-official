"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/fetcher";

type Invite = { id: string; company: string; position: string; expiresAt: string };

/** Invitations reçues par la personne connectée (si elle n'a pas ouvert le lien de l'e-mail). */
export function PendingInvites() {
  const router = useRouter();
  const [list, setList] = useState<Invite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ invitations: Invite[] }>("/api/invitations/pending").then((r) => setList(r.invitations), () => undefined);
  }, []);
  if (!list.length) return null;
  return (
    <section className="space-y-2" aria-label="Invitations reçues">
      {list.map((i) => (
        <div key={i.id} className="flex flex-col gap-3 rounded-2xl border-2 border-blue-300 bg-blue-50 p-4 sm:flex-row sm:items-center">
          <Mail className="h-6 w-6 shrink-0 text-blue-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">Invitation à rejoindre {i.company}</p>
            <p className="text-sm text-slate-600">Poste proposé : {i.position || "membre de l'équipe"} · valable jusqu&apos;au {new Date(i.expiresAt).toLocaleDateString("fr-FR")}</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(i.id);
              setError("");
              try {
                const r = await api<{ slug: string }>("/api/invitations/accept", { body: { invitationId: i.id } });
                router.push(`/apps/${r.slug}`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Erreur");
                setBusy(null);
              }
            }}
          >
            {busy === i.id && <span className="spinner" />}Accepter
          </button>
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
