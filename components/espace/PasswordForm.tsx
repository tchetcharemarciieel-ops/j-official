"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useToast } from "@/components/Toaster";

/** Changement de mot de passe pour l'utilisateur connecté (sans e-mail). */
export function PasswordForm() {
  const toast = useToast();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (a.length < 8) return setError("Au moins 8 caractères.");
    if (a !== b) return setError("Les deux mots de passe ne correspondent pas.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: a });
    setBusy(false);
    if (error) return setError(/same|different/i.test(error.message) ? "Choisissez un mot de passe différent de l'actuel." : "Modification impossible. Reconnectez-vous puis réessayez.");
    setA("");
    setB("");
    toast("success", "Mot de passe modifié.");
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <label className="block"><span className="label">Nouveau mot de passe</span><input type="password" className="input" value={a} onChange={(e) => setA(e.target.value)} autoComplete="new-password" minLength={8} /></label>
      <label className="block"><span className="label">Confirmer</span><input type="password" className="input" value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" minLength={8} /></label>
      {error && <p role="alert" className="text-sm text-red-300 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2"><button className="btn btn-ghost" disabled={busy}>{busy && <span className="spinner" />}Changer le mot de passe</button></div>
    </form>
  );
}
