"use client";

import { Check, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Tracked = { number: string; shop: string; status: string; status_label: string; mode: string; pay_mode: string; pay_status: string; total: number; items: { name: string; qty: number; unit_price: number }[]; history: { status: string; label: string; at: string }[]; at: string; pay_url: string | null };
const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
const STEPS_DELIVERY = ["nouvelle", "confirmee", "preparation", "prete", "livraison", "livree"];
const STEPS_PICKUP = ["nouvelle", "confirmee", "preparation", "prete", "retiree"];
const LABEL: Record<string, string> = { nouvelle: "Reçue", attente: "En attente", confirmee: "Confirmée", preparation: "En préparation", prete: "Prête", livraison: "En livraison", livree: "Livrée", retiree: "Retirée" };

/** Suivi public d'une commande : lien secret, ou numéro + téléphone. Se met à jour tout seul. */
export function ShopTrack({ slug, token, test }: { slug: string; token: string | null; test: boolean }) {
  const [o, setO] = useState<Tracked | null>(null);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ n: "", p: "" });
  const [loading, setLoading] = useState(Boolean(token));
  const fetchOrder = useCallback(async (qs: string) => {
    try {
      const r = await fetch(`/api/public/shop/${slug}/track?${qs}${test ? "&test=1" : ""}`, { cache: "no-store" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Commande introuvable.");
      setO(b as Tracked);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [slug, test]);
  const qs = token ? `t=${encodeURIComponent(token)}` : o ? `n=${encodeURIComponent(f.n)}&p=${encodeURIComponent(f.p)}` : "";
  useEffect(() => {
    if (token) void fetchOrder(`t=${encodeURIComponent(token)}`);
  }, [token, fetchOrder]);
  useEffect(() => {
    if (!qs || !o) return;
    const t = setInterval(() => document.visibilityState === "visible" && void fetchOrder(qs), 20_000);
    return () => clearInterval(t);
  }, [qs, o, fetchOrder]);

  const steps = o?.mode === "retrait" ? STEPS_PICKUP : STEPS_DELIVERY;
  const reached = new Set(o?.history.map((h) => h.status));
  const cancelled = o?.status === "annulee" || o?.status === "remboursee";
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-slate-50 px-4 py-8">
      <Link href={`/shop/${slug}${test ? "?test=1" : ""}`} className="text-sm text-slate-500 underline">← Retour à la boutique</Link>
      <h1 className="mt-3 text-xl font-bold">Suivre ma commande</h1>
      {loading && <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-slate-400" aria-label="Chargement" />}
      {!o && !token && (
        <form className="mt-4 space-y-3 rounded-2xl bg-white p-4 shadow-sm" onSubmit={(e) => (e.preventDefault(), void fetchOrder(`n=${encodeURIComponent(f.n)}&p=${encodeURIComponent(f.p)}`))}>
          <label className="block"><span className="label">Numéro de commande</span><input className="input" value={f.n} onChange={(e) => setF({ ...f, n: e.target.value })} placeholder="CMD-2026-0001" /></label>
          <label className="block"><span className="label">Téléphone utilisé pour la commande</span><input className="input" inputMode="tel" value={f.p} onChange={(e) => setF({ ...f, p: e.target.value })} /></label>
          <button className="btn btn-primary w-full" disabled={!f.n || f.p.length < 6}><Search className="h-4 w-4" /> Rechercher</button>
        </form>
      )}
      {err && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {o && (
        <div className="mt-4 space-y-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{o.shop}</p>
            <p className="text-lg font-bold">{o.number}</p>
            <p className={`mt-1 inline-block rounded-full px-3 py-1 text-sm font-medium ${cancelled ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>{o.status_label}</p>
            {o.pay_status === "paye" && <p className="mt-2 text-sm text-emerald-700">✓ Paiement confirmé</p>}
            {o.pay_url && <a className="btn btn-primary mt-3 w-full" href={o.pay_url}>Payer avec ZingoPay</a>}
          </section>
          {!cancelled && (
            <ol className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
              {steps.map((s) => {
                const on = reached.has(s as never) || (s === "nouvelle" && reached.has("attente" as never));
                return <li key={s} className={`flex items-center gap-3 text-sm ${on ? "font-medium text-slate-900" : "text-slate-400"}`}><span className={`grid h-6 w-6 place-items-center rounded-full ${on ? "bg-emerald-600 text-white" : "bg-slate-200"}`}>{on && <Check className="h-3.5 w-3.5" />}</span>{LABEL[s]}</li>;
              })}
            </ol>
          )}
          <section className="rounded-2xl bg-white p-4 text-sm shadow-sm">
            <ul className="space-y-1">{o.items.map((l, i) => <li key={i} className="flex justify-between gap-2"><span>{l.name} × {l.qty}</span><span>{fcfa(l.qty * l.unit_price)}</span></li>)}</ul>
            <p className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-base font-bold"><span>Total</span><span>{fcfa(o.total)}</span></p>
            <p className="mt-1 text-xs text-slate-500">{o.mode === "livraison" ? "Livraison" : "Retrait en boutique"} · {o.pay_mode === "zingopay" ? "ZingoPay" : o.pay_mode === "livraison" ? "Paiement à la livraison" : "Paiement au retrait"}</p>
          </section>
        </div>
      )}
    </main>
  );
}
