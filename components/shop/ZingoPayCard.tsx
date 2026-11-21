"use client";

import { Check, Copy, CreditCard, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useCtx } from "./context";
import { Card, Field } from "./ui";

type State = { configured: boolean; enabled: boolean; mode: "test" | "live" | null; hint: string | null; signed: boolean; webhookPath: string | null };

async function call(url: string, method: string, body?: unknown): Promise<State> {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error ?? "Erreur. Réessayez.");
  return b as State;
}

/**
 * Paiement en ligne ZingoPay (ALETCHCARD) de la boutique : le commerçant colle SA clé secrète
 * (l'argent arrive sur son compte). Clé vérifiée, chiffrée côté serveur, jamais réaffichée.
 * Une commande n'est payée qu'après relecture du statut chez ZingoPay.
 */
export function ZingoPayCard() {
  const c = useCtx();
  const base = `/api/projects/${c.projectId}/zingopay`;
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ apiKey: "", webhookSecret: "", enabled: true });
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await call(base, "GET");
      setS(r);
      setF((x) => ({ ...x, enabled: r.configured ? r.enabled : true }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    }
  }, [base]);
  useEffect(() => {
    if (c.mode === "live") void load();
  }, [load, c.mode]);
  if (c.mode !== "live") return null;
  const webhook = s?.webhookPath ? `${location.origin}${s.webhookPath}` : null;
  return (
    <Card title={<span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Paiement en ligne ZingoPay</span>} subtitle="Le client paie le montant exact de sa commande ; l'argent arrive sur votre compte ZingoPay. La commande n'est marquée payée qu'après vérification auprès de ZingoPay.">
      <div className="space-y-3 text-sm">
        {s?.configured && (
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
            <KeyRound className="h-4 w-4 text-slate-500" /> Clé enregistrée : <code>{s.hint}</code>
            {s.mode === "test" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Démonstration : argent fictif</span>}
            {s.signed ? <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Notifications signées</span> : <span className="text-slate-500">Secret de signature non renseigné (facultatif)</span>}
          </p>
        )}
        {s && (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            setErr("");
            try {
              const r = await call(base, "PUT", { apiKey: f.apiKey || undefined, webhookSecret: f.webhookSecret || undefined, enabled: f.enabled });
              setS(r);
              setF({ apiKey: "", webhookSecret: "", enabled: r.enabled });
              c.notify("success", r.enabled ? "ZingoPay est actif sur votre boutique." : "Réglages enregistrés (ZingoPay désactivé).");
              await c.load();
            } catch (x) {
              setErr(x instanceof Error ? x.message : "Erreur");
            }
          }}>
            <Field label={s.configured ? "Nouvelle clé secrète (vide = garder l'actuelle)" : "Clé secrète ZingoPay"} hint="Dans votre espace ZingoPay : Liens de paiement, « Connecter mon logiciel de caisse ». Ne l'envoyez jamais par message.">
              <input className="input" type="password" autoComplete="off" spellCheck={false} value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder="zp_test_… ou zp_live_…" required={!s.configured} />
            </Field>
            <Field label="Secret de signature des notifications (facultatif, recommandé)">
              <input className="input" type="password" autoComplete="off" spellCheck={false} value={f.webhookSecret} onChange={(e) => setF({ ...f, webhookSecret: e.target.value })} placeholder={s.signed ? "Déjà enregistré : vide = garder" : "Secret de signature"} />
            </Field>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Proposer « Payer avec ZingoPay » aux clients</label>
            {err && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{err}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary">{s.configured ? "Enregistrer" : "Vérifier et connecter"}</button>
              {s.configured && <button type="button" className="btn btn-ghost" onClick={async () => {
                if (!confirm("Retirer la clé ZingoPay ?")) return;
                try { setS(await call(base, "DELETE")); await c.load(); } catch (x) { setErr(x instanceof Error ? x.message : "Erreur"); }
              }}><Trash2 className="h-4 w-4" /> Retirer la clé</button>}
            </div>
          </form>
        )}
        {!s && err && <p className="text-xs text-slate-500">{err}</p>}
        {webhook && (
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold">Adresse de notification à coller dans ZingoPay :</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-2 py-1.5 text-xs">{webhook}</code>
              <button className="btn btn-ghost !px-3 !py-1.5 text-xs" onClick={async () => { await navigator.clipboard?.writeText(webhook).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copié" : "Copier"}</button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
