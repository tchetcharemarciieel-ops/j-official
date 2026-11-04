"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * Les liens d'e-mail Supabase (invitation, lien de connexion) reviennent avec la session dans
 * l'adresse (#access_token…). On l'enregistre, on efface l'adresse, puis on ouvre l'invitation.
 */
export function InvitationLanding() {
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("next") ?? "/espace";
    const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/espace";
    const hash = new URLSearchParams(window.location.hash.slice(1));
    history.replaceState(null, "", window.location.pathname);
    if (hash.get("error")) {
      setError(hash.get("error_code") === "otp_expired" ? "Ce lien a expiré. Demandez à votre responsable de renvoyer l'invitation." : "Lien invalide ou déjà utilisé. Demandez un nouvel envoi de l'invitation.");
      return;
    }
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    if (!access_token || !refresh_token) return window.location.replace(next);
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error: e }) => (e ? setError("Connexion impossible avec ce lien. Ouvrez à nouveau l'e-mail ou connectez-vous.") : window.location.replace(next)));
  }, []);
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      {error ? (
        <div className="max-w-sm">
          <p className="text-sm text-red-700">{error}</p>
          <a href="/connexion" className="btn btn-primary mt-4 inline-flex">Se connecter</a>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-slate-600"><span className="spinner !border-slate-300 !border-t-slate-600" aria-hidden />Ouverture de votre invitation…</p>
      )}
    </main>
  );
}
