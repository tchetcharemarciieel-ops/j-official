"use client";

import { Check, FileText, Loader2, MapPin, Package, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Info = { name: string; slug: string; type: string; phone: string; email: string; address: string; primary: string; logo: boolean; currency: string; open: boolean; zones: string[]; parcel_types: string[]; urgency: { normal: number; express: number; urgent: number }; pay: { delivery: boolean; cash: boolean; mobile: boolean; mobile_info: string }; priced: boolean; demo: boolean };
type Quote = { total: number; lines: { label: string; amount: number }[]; configured: boolean };
type Tracked = { company: string; number: string; tracking: string; status: string; status_label: string; progress: number; steps: { status: string; label: string; done: boolean }[]; at: string; eta: string | null; delivered_at: string | null; courier: string | null; history: { status: string; label: string; at: string }[]; failed: string | null; price: number; paid: number; currency: string };
const URG = { normal: "Normale", express: "Express", urgent: "Urgente" } as const;
const VEH = { moto: "Moto", voiture: "Voiture", camionnette: "Camionnette", camion: "Camion" } as const;
const money = (n: number, cur: string) => `${Math.round(n).toLocaleString("fr-FR")} ${cur === "EUR" ? "€" : cur === "USD" ? "$" : "FCFA"}`;
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/** Page publique d'une entreprise de transport : demande de livraison avec prix avant envoi, suivi par numéro, mes demandes. */
export function TransportFront({ slug, test, tab: first, initialTracking }: { slug: string; test: boolean; tab: "request" | "track"; initialTracking: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"request" | "track" | "mine">(first);
  const key = `mstransport:${slug}`;
  const [mine, setMine] = useState<{ n: string; number: string; at: string; phone: string }[]>([]);
  useEffect(() => {
    fetch(`/api/public/transport/${slug}${test ? "?test=1" : ""}`, { cache: "no-store" }).then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error ?? "Entreprise introuvable."); setInfo(b); }).catch((e) => setErr(e instanceof Error ? e.message : "Erreur"));
    try { setMine(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { /* stockage indisponible */ }
  }, [slug, test, key]);
  const remember = (e: { n: string; number: string; phone: string }) => { const next = [{ ...e, at: new Date().toISOString() }, ...mine.filter((x) => x.n !== e.n)].slice(0, 20); setMine(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignoré */ } };
  if (err) return <main className="mx-auto grid min-h-dvh max-w-md place-items-center p-6 text-center"><p className="text-slate-700">{err}</p></main>;
  if (!info) return <main className="grid min-h-dvh place-items-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Chargement" /></main>;
  const brand = { "--brand": info.primary } as React.CSSProperties;
  return (
    <main style={brand} className="mx-auto min-h-dvh max-w-xl bg-slate-50 px-4 pb-16 pt-6">
      <header className="flex items-center gap-3">
        {info.logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/public/transport/${slug}/logo${test ? "?test=1" : ""}`} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--brand)] font-bold text-white">{info.name.slice(0, 2).toUpperCase()}</span>}
        <div className="min-w-0"><h1 className="truncate text-lg font-bold">{info.name}</h1><p className="text-xs text-slate-500">{info.type}{info.phone ? ` · ${info.phone}` : ""}</p></div>
      </header>
      {info.demo && <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">Aperçu avec les données de test.</p>}
      <div className="mt-4 flex gap-1 rounded-xl bg-slate-200 p-1 text-sm" role="tablist">
        {([["request", "Demander une livraison"], ["track", "Suivre un colis"], ["mine", `Mes demandes${mine.length ? ` (${mine.length})` : ""}`]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 rounded-lg px-2 py-2 font-medium ${tab === k ? "bg-white shadow-sm" : "text-slate-600"}`}>{l}</button>)}
      </div>
      <div className="mt-4">
        {tab === "request" && <Request slug={slug} info={info} test={test} onDone={(e) => { remember(e); }} onTrack={() => setTab("track")} />}
        {tab === "track" && <Track slug={slug} test={test} initial={initialTracking} info={info} onFound={(t) => remember({ n: t.tracking, number: t.number, phone: "" })} />}
        {tab === "mine" && (mine.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Vos demandes faites depuis cet appareil apparaîtront ici. Aucun compte n&apos;est nécessaire : gardez simplement votre numéro de suivi.</p> : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">{mine.map((m) => <li key={m.n}><a className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50" href={`/livraison/${slug}/suivi?n=${m.n}${test ? "&test=1" : ""}`}><span><b>{m.number}</b><span className="block font-mono text-xs text-slate-500">{m.n}</span></span><span className="text-xs text-slate-500">{dt(m.at)}</span></a></li>)}</ul>
        ))}
      </div>
      <footer className="mt-8 text-center text-xs text-slate-400">{info.address}{info.address && " · "}Propulsé par MiniSoft Transport &amp; Delivery</footer>
    </main>
  );
}

function Request({ slug, info, test, onDone, onTrack }: { slug: string; info: Info; test: boolean; onDone: (e: { n: string; number: string; phone: string }) => void; onTrack: () => void }) {
  const [f, setF] = useState({ sn: "", sp: "", rn: "", rp: "", pa: "", da: "", desc: "", weight: "", ptype: info.parcel_types[0] ?? "", zone: "", urgency: "normal" as keyof typeof URG, vehicle: "moto" as keyof typeof VEH, instructions: "", pay: (info.pay.delivery ? "livraison" : info.pay.cash ? "especes" : "mobile_money") as string, hp: "" });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ tracking: string; number: string } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const post = useCallback(async (action: "quote" | "request", data: unknown) => {
    const r = await fetch(`/api/public/transport/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ demo: test, action, data }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error ?? "Erreur");
    return b;
  }, [slug, test]);
  const w = f.weight.trim() === "" ? null : Number(f.weight.replace(",", "."));
  useEffect(() => {
    if (!info.priced) return;
    const h = setTimeout(() => void post("quote", { zone: f.zone, urgency: f.urgency, vehicle_kind: f.vehicle, distance_km: null, parcel: { weight_kg: w, type: f.ptype } }).then((b) => setQuote(b.data)).catch(() => setQuote(null)), 300);
    return () => clearTimeout(h);
  }, [f.zone, f.urgency, f.vehicle, f.weight, f.ptype, info.priced, post]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!info.open) return <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">Cette entreprise n&apos;accepte pas encore les demandes en ligne.{info.phone ? <> Appelez le <a className="font-semibold underline" href={`tel:${info.phone}`}>{info.phone}</a>.</> : null}</p>;
  if (done) return (
    <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
      <Check className="mx-auto h-8 w-8 text-emerald-600" />
      <h2 className="text-lg font-bold">Demande envoyée</h2>
      <p className="text-sm text-emerald-900">Commande {done.number}. Conservez votre numéro de suivi :</p>
      <p className="select-all rounded-xl bg-white px-3 py-2 font-mono text-xl font-bold tracking-wider">{done.tracking}</p>
      <p className="text-xs text-emerald-900">L&apos;entreprise va confirmer et affecter un livreur. Vous pourrez suivre l&apos;avancement avec ce numéro.</p>
      <a className="btn btn-primary w-full" href={`/livraison/${slug}/suivi?n=${done.tracking}${test ? "&test=1" : ""}`} onClick={(e) => { e.preventDefault(); onTrack(); }}>Suivre mon colis</a>
    </section>
  );
  const ok = f.sn.trim() && f.sp.trim().length >= 6 && f.rn.trim() && f.rp.trim().length >= 6 && f.pa.trim() && f.da.trim() && f.desc.trim();
  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const b = await post("request", { sender: { name: f.sn, phone: f.sp }, recipient: { name: f.rn, phone: f.rp }, pickup: { address: f.pa }, dropoff: { address: f.da }, parcel: { desc: f.desc, weight_kg: w, type: f.ptype }, zone: f.zone, urgency: f.urgency, vehicle_kind: f.vehicle, instructions: f.instructions, pay_mode: f.pay, hp: f.hp });
      setDone({ tracking: b.tracking, number: b.number });
      onDone({ n: b.tracking, number: b.number, phone: f.sp });
    } catch (e) { setErr(e instanceof Error ? e.message : "Envoi impossible."); } finally { setBusy(false); }
  };
  const I = "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base";
  return (
    <form className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" onSubmit={(e) => (e.preventDefault(), void submit())}>
      <h2 className="flex items-center gap-2 font-semibold"><Package className="h-5 w-5" /> Votre colis</h2>
      <input className={I} placeholder="Votre nom *" value={f.sn} onChange={(e) => set("sn", e.target.value)} maxLength={120} autoComplete="name" />
      <input className={I} placeholder="Votre téléphone *" inputMode="tel" value={f.sp} onChange={(e) => set("sp", e.target.value)} maxLength={30} autoComplete="tel" />
      <input className={I} placeholder="Adresse de récupération *" value={f.pa} onChange={(e) => set("pa", e.target.value)} maxLength={240} />
      <input className={I} placeholder="Nom du destinataire *" value={f.rn} onChange={(e) => set("rn", e.target.value)} maxLength={120} />
      <input className={I} placeholder="Téléphone du destinataire *" inputMode="tel" value={f.rp} onChange={(e) => set("rp", e.target.value)} maxLength={30} />
      <input className={I} placeholder="Adresse de livraison *" value={f.da} onChange={(e) => set("da", e.target.value)} maxLength={240} />
      <input className={I} placeholder="Description du colis *" value={f.desc} onChange={(e) => set("desc", e.target.value)} maxLength={400} />
      <div className="grid grid-cols-2 gap-2">
        <input className={I} placeholder="Poids (kg)" inputMode="decimal" value={f.weight} onChange={(e) => set("weight", e.target.value)} />
        {info.parcel_types.length > 0 ? <select className={I} value={f.ptype} onChange={(e) => set("ptype", e.target.value)} aria-label="Type de colis">{info.parcel_types.map((p) => <option key={p}>{p}</option>)}</select> : <span />}
        {info.zones.length > 0 && <select className={I} value={f.zone} onChange={(e) => set("zone", e.target.value)} aria-label="Zone"><option value="">Zone de livraison</option>{info.zones.map((z) => <option key={z}>{z}</option>)}</select>}
        <select className={I} value={f.urgency} onChange={(e) => set("urgency", e.target.value as keyof typeof URG)} aria-label="Urgence">{(Object.keys(URG) as (keyof typeof URG)[]).map((k) => <option key={k} value={k}>{URG[k]} (~{info.urgency[k]} h)</option>)}</select>
        <select className={I} value={f.vehicle} onChange={(e) => set("vehicle", e.target.value as keyof typeof VEH)} aria-label="Véhicule">{(Object.keys(VEH) as (keyof typeof VEH)[]).map((k) => <option key={k} value={k}>{VEH[k]}</option>)}</select>
      </div>
      <textarea className={I} rows={2} placeholder="Instructions particulières (fragile, étage…)" value={f.instructions} onChange={(e) => set("instructions", e.target.value)} maxLength={600} />
      <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden value={f.hp} onChange={(e) => set("hp", e.target.value)} />
      <fieldset className="space-y-1 text-sm"><legend className="mb-1 font-medium">Paiement</legend>
        {info.pay.delivery && <label className="flex items-center gap-2"><input type="radio" name="pay" checked={f.pay === "livraison"} onChange={() => set("pay", "livraison")} /> À la livraison</label>}
        {info.pay.cash && <label className="flex items-center gap-2"><input type="radio" name="pay" checked={f.pay === "especes"} onChange={() => set("pay", "especes")} /> Espèces à l&apos;enlèvement</label>}
        {info.pay.mobile && <label className="flex items-center gap-2"><input type="radio" name="pay" checked={f.pay === "mobile_money"} onChange={() => set("pay", "mobile_money")} /> Paiement mobile</label>}
        {f.pay === "mobile_money" && info.pay.mobile_info && <p className="rounded-lg bg-slate-100 p-2 text-xs">{info.pay.mobile_info}<br />Le paiement sera confirmé par l&apos;entreprise avec votre numéro de transaction.</p>}
      </fieldset>
      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        {info.priced ? (quote?.configured ? (<><p className="text-xs text-slate-500">Prix estimé avant validation</p><p className="text-2xl font-bold">{money(quote.total, info.currency)}</p>{quote.lines.some((l) => l.amount) && <ul className="text-xs text-slate-600">{quote.lines.filter((l) => l.amount).map((l, i) => <li key={i}>{l.label} : {money(l.amount, info.currency)}</li>)}</ul>}<p className="mt-1 text-xs text-slate-500">La distance exacte est confirmée par l&apos;entreprise ; le prix final peut être ajusté.</p></>) : <p className="text-slate-500">Calcul du prix…</p>) : <p className="text-slate-600">Le prix vous sera communiqué par l&apos;entreprise après réception de la demande.</p>}
      </div>
      {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <button className="min-h-12 w-full rounded-2xl bg-[var(--brand)] text-base font-semibold text-white disabled:opacity-50" disabled={!ok || busy}>{busy ? "Envoi…" : "Envoyer la demande"}</button>
    </form>
  );
}

function Track({ slug, test, initial, info, onFound }: { slug: string; test: boolean; initial: string; info: Info; onFound: (t: Tracked) => void }) {
  const [n, setN] = useState(initial);
  const [t, setT] = useState<Tracked | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const load = useCallback(async (code: string, quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      const r = await fetch(`/api/public/transport/${slug}/track?n=${encodeURIComponent(code)}${test ? "&test=1" : ""}`, { cache: "no-store" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Numéro introuvable.");
      setT(b); setErr(""); if (!quiet) onFound(b);
    } catch (e) { if (!quiet) { setT(null); setErr(e instanceof Error ? e.message : "Erreur"); } } finally { setBusy(false); }
  }, [slug, test]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (initial) void load(initial); }, [initial, load]);
  useEffect(() => { if (!t) return; const h = setInterval(() => document.visibilityState === "visible" && void load(t.tracking, true), 20_000); return () => clearInterval(h); }, [t, load]);
  const bad = t && (t.status === "annule" || t.status === "echec" || t.status === "retour");
  return (
    <section className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), void load(n.trim()))}>
        <input className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-mono text-base uppercase" placeholder="Numéro de suivi (TR…)" value={n} onChange={(e) => setN(e.target.value)} maxLength={12} aria-label="Numéro de suivi" />
        <button className="grid w-14 place-items-center rounded-xl bg-[var(--brand)] text-white" disabled={busy || n.trim().length < 6} aria-label="Rechercher"><Search className="h-5 w-5" /></button>
      </form>
      {busy && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" aria-label="Chargement" />}
      {err && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {t && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2"><div><p className="font-bold">{t.number}</p><p className="font-mono text-xs text-slate-500">{t.tracking}</p></div><span className={`rounded-full px-3 py-1 text-sm font-semibold ${t.status === "livre" ? "bg-emerald-100 text-emerald-800" : bad ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-800"}`}>{t.status_label}</span></div>
          <div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={t.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progression"><div className={`h-full rounded-full ${bad ? "bg-red-400" : "bg-[var(--brand)]"}`} style={{ width: `${t.progress}%` }} /></div><p className="mt-1 text-right text-xs text-slate-500">{t.progress} %</p></div>
          <ol className="space-y-2">{t.steps.map((s) => <li key={s.status} className={`flex items-center gap-2 text-sm ${s.done ? "font-medium text-slate-900" : "text-slate-400"}`}><span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${s.done ? "bg-emerald-500 text-white" : "bg-slate-200"}`}>{s.done ? <Check className="h-3 w-3" /> : ""}</span>{s.label}</li>)}</ol>
          {t.failed && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{t.failed}</p>}
          <dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-xs text-slate-500">Commandée le</dt><dd>{dt(t.at)}</dd></div>{t.eta && <div><dt className="text-xs text-slate-500">Livraison estimée</dt><dd>{dt(t.eta)}</dd></div>}{t.delivered_at && <div><dt className="text-xs text-slate-500">Livrée le</dt><dd>{dt(t.delivered_at)}</dd></div>}{t.courier && <div><dt className="text-xs text-slate-500">Livreur</dt><dd>{t.courier}</dd></div>}<div><dt className="text-xs text-slate-500">Prix</dt><dd>{t.price ? money(t.price, t.currency) : "À confirmer"}</dd></div></dl>
          <details className="text-sm"><summary className="flex cursor-pointer items-center gap-1 font-medium"><FileText className="h-4 w-4" /> Télécharger la facture</summary>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); window.open(`/api/public/transport/${slug}/invoice?n=${t.tracking}&p=${encodeURIComponent(phone)}`, "_blank"); }}><input className="w-full rounded-xl border border-slate-300 px-3 py-2" inputMode="tel" placeholder="Téléphone utilisé pour la commande" value={phone} onChange={(e) => setPhone(e.target.value)} /><button className="rounded-xl bg-slate-900 px-3 text-white" disabled={phone.replace(/\D/g, "").length < 6}>PDF</button></form></details>
          <ol className="space-y-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">{[...t.history].reverse().map((h, i) => <li key={i}><b>{h.label}</b> · {dt(h.at)}</li>)}</ol>
          {info.phone && <a className="flex items-center justify-center gap-1 text-sm text-[var(--brand)] underline" href={`tel:${info.phone}`}><MapPin className="h-4 w-4" /> Contacter {info.name}</a>}
        </div>
      )}
    </section>
  );
}
