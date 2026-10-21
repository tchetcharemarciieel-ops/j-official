"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/espace";
}

function frError(message: string) {
  if (/invalid login/i.test(message)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(message)) return "Confirmez d'abord votre adresse e-mail (lien reçu par e-mail).";
  if (/already registered/i.test(message)) return "Un compte existe déjà avec cette adresse.";
  if (/password/i.test(message) && /6|characters/i.test(message)) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (/rate limit/i.test(message)) return "Trop de tentatives. Patientez quelques minutes.";
  return "Une erreur est survenue. Réessayez.";
}

export function AuthForm({ mode }: { mode: "login" | "signup" | "forgot" | "reset" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(params.get("erreur") === "lien" ? "Lien invalide ou expiré." : "");
  const [info, setInfo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if ((mode === "signup" || mode === "reset") && password.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
    setLoading(true);
    const supabase = createClient();
    const origin = window.location.origin;
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return setError(frError(error.message));
        router.replace(next);
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } });
        if (error) return setError(frError(error.message));
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else setInfo("Compte créé. Ouvrez le lien de confirmation envoyé à votre adresse e-mail pour continuer.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reinitialiser` });
        if (error) return setError(frError(error.message));
        setInfo("Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.");
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return setError(frError(error.message));
        setInfo("Mot de passe modifié.");
        setTimeout(() => router.replace("/espace"), 800);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="name">Nom complet</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
        </div>
      )}
      {mode !== "reset" && (
        <div>
          <label className="label" htmlFor="email">Adresse e-mail</label>
          <input id="email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
      )}
      {mode !== "forgot" && (
        <div>
          <label className="label" htmlFor="password">{mode === "reset" ? "Nouveau mot de passe" : "Mot de passe"}</label>
          <input id="password" type="password" className="input" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
      {info && <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{info}</p>}
      <button className="btn btn-primary w-full" disabled={loading}>
        {loading && <span className="spinner" />}
        {mode === "login" ? "Se connecter" : mode === "signup" ? "Créer mon compte" : mode === "forgot" ? "Envoyer le lien" : "Enregistrer"}
      </button>
      <div className="flex flex-col gap-2 text-center text-sm text-slate-400">
        {mode === "login" && (
          <>
            <Link href="/mot-de-passe-oublie" className="hover:text-white">Mot de passe oublié ?</Link>
            <Link href={`/inscription?next=${encodeURIComponent(next)}`} className="hover:text-white">Pas encore de compte ? <span className="text-brand-300">Inscription</span></Link>
          </>
        )}
        {mode === "signup" && <Link href={`/connexion?next=${encodeURIComponent(next)}`} className="hover:text-white">Déjà inscrit ? <span className="text-brand-300">Connexion</span></Link>}
        {mode === "forgot" && <Link href="/connexion" className="hover:text-white">Retour à la connexion</Link>}
      </div>
    </form>
  );
}
