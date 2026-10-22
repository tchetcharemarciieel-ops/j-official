"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

async function logAdminLogin() {
  // Journal des connexions administrateur (vérifié côté serveur : session aal2 obligatoire).
  await fetch("/api/admin/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
}

function CodeForm({ onSubmit, busy, label }: { onSubmit: (code: string) => void; busy: boolean; label: string }) {
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (/^\d{6}$/.test(code)) onSubmit(code);
      }}
      className="space-y-3"
    >
      <label className="label" htmlFor="code">{label}</label>
      <input id="code" className="input text-center text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
      <button className="btn btn-primary w-full" disabled={busy || code.length !== 6}>{busy && <span className="spinner" />}Valider</button>
    </form>
  );
}

/** Première configuration : application d'authentification (Google Authenticator, Microsoft Authenticator…). */
export function MfaEnroll() {
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      // Nettoyage d'une tentative précédente inachevée.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Admin MiniSoft RCA ${new Date().toISOString().slice(0, 16)}` });
      if (error || !data) return setError("Impossible de préparer la double authentification. Vérifiez qu'elle est activée dans Supabase (Authentication › Multi-Factor).");
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, []);

  async function verify(code: string) {
    if (!factor) return;
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) {
      setBusy(false);
      return setError("Code incorrect ou expiré. Saisissez le code affiché maintenant dans l'application.");
    }
    await logAdminLogin();
    window.location.assign("/admin");
  }

  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>Installez une application d&apos;authentification sur votre téléphone (Google Authenticator, Microsoft Authenticator…).</li>
        <li>Scannez ce code QR avec l&apos;application.</li>
        <li>Saisissez le code à 6 chiffres qu&apos;elle affiche.</li>
      </ol>
      {factor ? (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={factor.qr} alt="Code QR de double authentification" className="h-48 w-48 rounded-lg border border-slate-200 bg-white p-2" />
          <p className="text-center text-xs text-slate-500">Saisie manuelle : <code className="break-all font-mono text-slate-700">{factor.secret}</code></p>
        </div>
      ) : (
        !error && <p className="text-sm text-slate-500">Préparation…</p>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {factor && <CodeForm onSubmit={verify} busy={busy} label="Code à 6 chiffres" />}
    </div>
  );
}

/** Connexions suivantes : code de l'application d'authentification. */
export function MfaVerify() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function verify(code: string) {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp?.find((f) => f.status === "verified");
    if (!factor) {
      setBusy(false);
      return setError("Aucune application d'authentification n'est configurée.");
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) {
      setBusy(false);
      return setError("Code incorrect ou expiré.");
    }
    await logAdminLogin();
    window.location.assign("/admin");
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">Ouvrez votre application d&apos;authentification et saisissez le code MiniSoft RCA.</p>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <CodeForm onSubmit={verify} busy={busy} label="Code de sécurité" />
    </div>
  );
}
