"use client";

import { Check, Copy, CreditCard, ExternalLink, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Btn, Card, Field, inp, isMgr, Pill, useV } from "../ui";

type State = { configured: boolean; enabled: boolean; mode: "test" | "live" | null; hint: string | null; signed: boolean; updatedAt: string | null; webhookPath: string | null };

async function call(url: string, method: string, body?: unknown): Promise<State> {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error ?? "Erreur. Réessayez.");
  return b as State;
}

/**
 * Paiement en ligne ZingoPay du restaurant : le gérant colle SA clé secrète (l'argent arrive sur
 * son compte) et, s'il le souhaite, le secret de signature des notifications. La clé est vérifiée
 * auprès de ZingoPay, gardée chiffrée sur le serveur et n'est plus jamais affichée.
 */
export function ZingoPayCard() {
  const { projectId, level } = useV();
  const mgr = isMgr(level);
  const base = `/api/projects/${projectId}/zingopay`;
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
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
    void load();
  }, [load]);
  const webhook = s?.webhookPath && typeof window !== "undefined" ? `${window.location.origin}${s.webhookPath}` : null;

  return (
    <Card title="Paiement en ligne ZingoPay" actions={s?.configured ? <Pill tone={s.enabled ? "green" : "slate"}>{s.enabled ? (s.mode === "test" ? "Actif · démonstration" : "Actif") : "Désactivé"}</Pill> : <Pill tone="slate">Non connecté</Pill>}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">Le client paie le montant exact de sa commande avec son compte ZingoPay, depuis le menu QR. L&apos;argent arrive sur <b>votre</b> compte ZingoPay. La commande n&apos;est marquée payée qu&apos;après vérification auprès de ZingoPay.</p>
        {s?.configured && (
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <KeyRound className="h-4 w-4 text-slate-500" aria-hidden />Clé enregistrée : <code>{s.hint}</code>
            {s.mode === "test" && <Pill tone="amber">Démonstration : argent fictif</Pill>}
            {s.signed ? <span className="inline-flex items-center gap-1 text-green-700"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />Notifications signées</span> : <span className="text-slate-500">Secret de signature non renseigné (facultatif)</span>}
          </p>
        )}
        {!s && !err && <p className="text-slate-500">Chargement…</p>}
        {mgr && s && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr("");
              setOk("");
              try {
                const r = await call(base, "PUT", { apiKey: f.apiKey || undefined, webhookSecret: f.webhookSecret || undefined, enabled: f.enabled });
                setS(r);
                setF({ apiKey: "", webhookSecret: "", enabled: r.enabled });
                setOk(r.enabled ? "ZingoPay est actif : vos clients le voient sur le menu." : "Réglages enregistrés (ZingoPay désactivé sur le menu).");
              } catch (x) {
                setErr(x instanceof Error ? x.message : "Erreur");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label={s.configured ? "Nouvelle clé secrète (laisser vide pour garder l'actuelle)" : "Clé secrète ZingoPay du restaurant"}>
              <input className={inp} type="password" autoComplete="off" spellCheck={false} value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder="zp_test_… ou zp_live_…" required={!s.configured} />
            </Field>
            <p className="-mt-1 text-xs text-slate-500">Dans votre espace ZingoPay : Liens de paiement, puis « Connecter mon logiciel de caisse ». Ne l&apos;envoyez jamais par message.</p>
            <Field label="Secret de signature des notifications (facultatif, recommandé)">
              <input className={inp} type="password" autoComplete="off" spellCheck={false} value={f.webhookSecret} onChange={(e) => setF({ ...f, webhookSecret: e.target.value })} placeholder={s.signed ? "Déjà enregistré : laisser vide pour le garder" : "Secret de signature"} />
            </Field>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
              <span><span className="font-medium">Proposer « Payer avec ZingoPay » sur le menu</span><span className="block text-xs text-slate-500">Le paiement à la caisse reste aussi proposé si vous l&apos;avez activé.</span></span>
            </label>
            {err && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{err}</p>}
            {ok && <p role="status" className="flex items-center gap-1.5 rounded-xl bg-green-50 px-3 py-2 text-green-800"><Check className="h-4 w-4" aria-hidden />{ok}</p>}
            <div className="flex flex-wrap gap-2">
              <Btn type="submit" busy={busy}><CreditCard className="h-4 w-4" aria-hidden />{s.configured ? "Enregistrer" : "Vérifier et connecter"}</Btn>
              {s.configured && (
                <Btn kind="ghost" onClick={async () => { if (!confirm("Retirer la clé ZingoPay ? Le menu ne proposera plus ce paiement.")) return; try { setS(await call(base, "DELETE")); setOk("Clé ZingoPay retirée."); } catch (x) { setErr(x instanceof Error ? x.message : "Erreur"); } }}>
                  <Trash2 className="h-4 w-4" aria-hidden />Retirer la clé
                </Btn>
              )}
            </div>
          </form>
        )}
        {!mgr && err && <p className="text-xs text-slate-500">{err}</p>}
        {webhook && (
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700">Adresse de notification à coller dans ZingoPay (« Notification de paiement ») :</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-2 py-1.5 text-xs">{webhook}</code>
              <Btn small kind="ghost" onClick={async () => { await navigator.clipboard.writeText(webhook).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied ? "Copié" : "Copier"}</Btn>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">Puis touchez « Envoyer un test » dans ZingoPay pour vérifier l&apos;adresse. <a className="inline-flex items-center gap-0.5 text-blue-700 underline" href="https://www.aletchcard.site/developpeurs" target="_blank" rel="noopener noreferrer">Documentation ZingoPay<ExternalLink className="h-3 w-3" aria-hidden /></a></p>
          </div>
        )}
      </div>
    </Card>
  );
}
