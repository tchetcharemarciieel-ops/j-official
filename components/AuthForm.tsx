"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { OnboardingAnswers } from "@/lib/onboarding";

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/espace";
}

function frError(message: string) {
  if (/invalid login/i.test(message)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(message)) return "Votre adresse e-mail n'est pas encore vérifiée. Demandez un code ci-dessous puis saisissez-le.";
  if (/already registered/i.test(message)) return "Un compte existe déjà avec cette adresse.";
  if (/password/i.test(message) && /6|characters/i.test(message)) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (/rate limit/i.test(message)) return "Trop de tentatives. Patientez quelques minutes.";
  if (/fetch|network|load failed/i.test(message)) return "Le service de connexion est injoignable depuis votre réseau. Réessayez dans un instant.";
  return `Une erreur est survenue (${message.slice(0, 80)}). Réessayez.`;
}

export function AuthForm({ mode, onboarding, onSignedUp }: { mode: "login" | "signup" | "forgot" | "reset"; onboarding?: OnboardingAnswers; onSignedUp?: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(params.get("erreur") === "expire" ? "Ce lien a expiré. Connectez-vous pour recevoir un nouvel e-mail de confirmation." : params.get("erreur") === "lien" ? "Lien invalide ou déjà utilisé." : "");
  const [info, setInfo] = useState(params.get("info") === "confirme" ? "Adresse e-mail confirmée. Connectez-vous avec votre e-mail et votre mot de passe." : params.get("info") === "deconnecte" ? "Vous êtes déconnecté. Saisissez votre e-mail et votre mot de passe pour vous reconnecter." : "");
  // Inscription réussie : en attente de la confirmation de l'adresse e-mail.
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);

  async function resend(address: string) {
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/auth/resend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: address, next }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setError(body.error ?? "Envoi impossible.");
    } catch {
      return setError("Pas de connexion Internet. Vérifiez votre réseau puis réessayez.");
    }
    setInfo(`Un nouveau code a été envoyé à ${address}.`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (mode === "signup" && !email.trim()) return setError("Indiquez votre adresse e-mail.");
    if ((mode === "signup" || mode === "reset") && password.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
    if (mode === "signup" && password !== confirm) return setError("Les deux mots de passe ne sont pas identiques.");
    setLoading(true);
    const supabase = { get auth() { return createClient().auth; } };
    const origin = window.location.origin;
    try {
      if (mode === "login") {
        const res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
        const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string[] };
        if (!res.ok) {
          setUnconfirmed(res.status === 403);
          return setError(body.details?.[0]?.split(" : ").pop() ?? body.error ?? "Connexion impossible.");
        }
        router.replace(next);
        router.refresh();
      } else if (mode === "signup") {
        const res = await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, fullName: name, companyName: company, onboarding, next }) });
        const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string[]; confirmationRequired?: boolean };
        if (!res.ok) return setError(body.details?.[0]?.split(" : ").pop() ?? body.error ?? "Inscription impossible.");
        onSignedUp?.();
        if (body.confirmationRequired === false) {
          // Confirmation désactivée côté Supabase : la session est déjà ouverte.
          router.replace(next);
          router.refresh();
          return;
        }
        setSentTo(email);
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
    } catch {
      setError("Impossible de joindre le serveur. Vérifiez votre connexion Internet puis réessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (sentTo)
    return (
      <div className="space-y-4 text-sm text-slate-700">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="font-semibold text-slate-900">Vérifiez votre adresse e-mail</p>
          <p className="mt-1">
            Un code de vérification vient d&apos;être envoyé à <strong>{sentTo}</strong>. Saisissez-le ci-dessous pour activer votre compte.
          </p>
          <p className="mt-2 text-xs text-slate-500">Pensez à regarder dans les courriers indésirables (spam).</p>
        </div>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setInfo("");
            setLoading(true);
            try {
              const res = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: sentTo, code }) });
              const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string[] };
              if (!res.ok) return setError(body.details?.[0]?.split(" : ").pop() ?? body.error ?? "Vérification impossible.");
              setInfo("Adresse vérifiée : bienvenue !");
              router.replace(next);
              router.refresh();
            } catch {
              setError("Impossible de joindre le serveur. Vérifiez votre connexion Internet puis réessayez.");
            } finally {
              setLoading(false);
            }
          }}
        >
          <label className="label" htmlFor="code">Code reçu par e-mail</label>
          <input id="code" className="input text-center font-mono text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={10} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" autoFocus />
          <button type="submit" className="btn btn-primary w-full" disabled={loading || code.length < 6}>{loading ? "Vérification…" : "Vérifier et accéder à mon compte"}</button>
        </form>
        {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-700">{error}</p>}
        {info && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-700">{info}</p>}
        <button type="button" className="btn btn-ghost w-full" onClick={() => resend(sentTo)}>Renvoyer un code</button>
        <p className="text-center">
          Mauvaise adresse ? <button type="button" className="text-blue-700" onClick={() => (setSentTo(""), setCode(""))}>Modifier</button>
        </p>
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="name">Nom complet</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
        </div>
      )}
      {mode === "signup" && onboarding && (
        <div>
          <label className="label" htmlFor="company">Nom de l&apos;entreprise <span className="font-normal text-slate-500">(facultatif)</span></label>
          <input id="company" className="input" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" maxLength={120} />
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
      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="confirm">Confirmation du mot de passe</label>
          <input id="confirm" type="password" className="input" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          {confirm && confirm !== password && <p className="mt-1 text-xs text-red-600">Les mots de passe ne correspondent pas.</p>}
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
      {mode === "login" && unconfirmed && email && (
        <button type="button" className="btn btn-ghost w-full" onClick={async () => { await resend(email); setSentTo(email); }}>Recevoir un code de vérification</button>
      )}
      {info && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{info}</p>}
      <button className="btn btn-primary w-full" disabled={loading}>
        {loading && <span className="spinner" />}
        {mode === "login" ? "Se connecter" : mode === "signup" ? "Créer mon compte" : mode === "forgot" ? "Envoyer le lien" : "Enregistrer"}
      </button>
      <div className="flex flex-col gap-2 text-center text-sm text-slate-600">
        {mode === "login" && (
          <>
            <Link href="/mot-de-passe-oublie" className="hover:text-slate-900">Mot de passe oublié ?</Link>
            <Link href={`/inscription?next=${encodeURIComponent(next)}`} className="hover:text-slate-900">Pas encore de compte ? <span className="text-blue-700">Inscription</span></Link>
          </>
        )}
        {mode === "signup" && <Link href={`/connexion?next=${encodeURIComponent(next)}`} className="hover:text-slate-900">Déjà inscrit ? <span className="text-blue-700">Connexion</span></Link>}
        {mode === "forgot" && <Link href="/connexion" className="hover:text-slate-900">Retour à la connexion</Link>}
      </div>
    </form>
  );
}
