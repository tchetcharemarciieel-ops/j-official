"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/fetcher";
import { createClient } from "@/lib/supabase/browser";

/**
 * Acceptation : vérifie que le compte connecté est bien celui invité. Après l'e-mail
 * d'invitation (nouveau compte), l'employé choisit d'abord son propre mot de passe.
 */
export function AcceptInvite({ token, email, invitedEmail, needPassword }: { token: string; email: string; invitedEmail: string; needPassword: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const wrong = email.toLowerCase() !== invitedEmail.toLowerCase();
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        if (needPassword) {
          if (pwd.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
          if (pwd !== pwd2) return setError("Les deux mots de passe ne sont pas identiques.");
        }
        setBusy(true);
        try {
          if (needPassword) {
            const { error: e2 } = await createClient().auth.updateUser({ password: pwd });
            if (e2) throw new Error(/weak|short/i.test(e2.message) ? "Mot de passe trop faible : choisissez-en un plus long." : "Enregistrement du mot de passe impossible. Réessayez.");
          }
          const r = await api<{ slug: string }>("/api/invitations/accept", { body: { token } });
          router.replace(`/apps/${r.slug}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Erreur");
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-slate-700">Connecté en tant que <b>{email}</b>.</p>
      {wrong ? (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">Cette invitation est destinée à {invitedEmail}. Déconnectez-vous puis connectez-vous (ou créez un compte) avec cette adresse.</p>
      ) : (
        <>
          {needPassword && (
            <>
              <p className="text-sm text-slate-700">Choisissez votre mot de passe personnel : vous l&apos;utiliserez pour vous connecter.</p>
              <label className="block text-sm font-medium">Mot de passe<input type="password" className="input mt-1" autoComplete="new-password" minLength={8} required value={pwd} onChange={(e) => setPwd(e.target.value)} /></label>
              <label className="block text-sm font-medium">Confirmer le mot de passe<input type="password" className="input mt-1" autoComplete="new-password" minLength={8} required value={pwd2} onChange={(e) => setPwd2(e.target.value)} /></label>
            </>
          )}
          {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy && <span className="spinner" />}{needPassword ? "Enregistrer et rejoindre l'équipe" : "Accepter l'invitation"}</button>
        </>
      )}
      <p className="text-xs text-slate-500">Vous aurez accès uniquement aux fonctions de votre poste, définies par votre responsable.</p>
    </form>
  );
}
