"use client";

import { Activity, ArrowDownRight, ArrowUpRight, Check, CircleAlert, Clock, Copy, Eye, Globe, Laptop, Link2, Loader2, MousePointerClick, RefreshCw, Smartphone, Tablet, Unplug, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { change, PERIOD_LABELS, PERIODS, type Granularity, type Period, type SectorProfile, type Stats } from "@/lib/website/model";

type SiteView = {
  url: string;
  host: string;
  status: "pending" | "connected" | "error";
  lastError: string | null;
  detected: { snippet?: boolean; tools?: { id: string; label: string; detail?: string }[]; platform?: string | null; api?: string | null; reachable?: boolean; checkedAt?: string };
  verifiedAt: string | null;
  connectedAt: string | null;
  lastEventAt: string | null;
  quietDays: number | null;
  snippet: string | null;
};
type State = { site: SiteView | null; profile: SectorProfile; canManage: boolean };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}) } });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((b as { error?: string }).error ?? "Erreur. Réessayez.");
  return b as T;
}
const nf = (n: number) => n.toLocaleString("fr-FR");
const dur = (s: number | null) => (s == null ? "—" : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * Site Internet connecté : l'entreprise relie SON site existant (MiniSoft ne crée pas de site) par un
 * code de suivi, puis suit ses visiteurs et ses conversions. « Connecté » s'affiche seulement après
 * une vraie visite reçue depuis ce site ; tous les chiffres viennent d'événements enregistrés.
 */
export function WebsiteTab({ projectId }: { projectId: string }) {
  const base = `/api/projects/${projectId}/website`;
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"" | "connect" | "verify" | "delete">("");
  const [url, setUrl] = useState("");
  const load = useCallback(async () => {
    try {
      setS(await call<State>(base));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);
  // En attente de la première visite : on revérifie toutes les 15 s.
  useEffect(() => {
    if (s?.site?.status !== "pending") return;
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [s?.site?.status, load]);

  const connect = async (value: string, kind: "connect" | "verify") => {
    setBusy(kind);
    setErr("");
    try {
      setS(await call<State>(base, { method: "POST", body: JSON.stringify({ url: value }) }));
      setUrl("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy("");
    }
  };

  if (!s) return <div className="glass rounded-2xl p-8 text-center text-sm text-slate-500">{err || "Chargement…"}</div>;
  const site = s.site;
  return (
    <div className="space-y-6">
      <section className="glass rounded-2xl p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Globe className="h-6 w-6" aria-hidden /></span>
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">Site Internet connecté</h2>
              <p className="mt-0.5 text-sm text-slate-600">Reliez le site Internet que vous avez déjà pour suivre ses visiteurs ici. MiniSoft ne crée pas de site.</p>
            </div>
          </div>
          {site && <StatusPill site={site} />}
        </div>

        {err && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}

        {!site && s.canManage && (
          <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={(e) => (e.preventDefault(), void connect(url, "connect"))}>
            <label htmlFor="site-url" className="sr-only">Adresse de votre site</label>
            <input id="site-url" className="input" inputMode="url" autoComplete="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.mon-entreprise.cf" required maxLength={300} />
            <button className="btn btn-primary shrink-0" disabled={busy !== "" || url.trim().length < 4}>{busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}Connecter mon site</button>
          </form>
        )}
        {!site && !s.canManage && <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">Aucun site n&apos;est connecté. Seul le responsable du logiciel peut connecter le site de l&apos;entreprise.</p>}

        {site && (
          <div className="mt-5 space-y-4">
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700"><Globe className="h-4 w-4 text-slate-400" aria-hidden /><a className="font-medium text-blue-700 underline" href={site.url} target="_blank" rel="noopener noreferrer">{site.url}</a>{site.lastEventAt && <span className="text-xs text-slate-500">· dernière visite reçue : {when(site.lastEventAt)}</span>}</p>
            {site.status === "error" && <p className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{site.lastError ?? "Le site n'a pas pu être vérifié."}</p>}
            {site.status === "connected" && site.quietDays != null && site.quietDays >= 3 && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Aucune visite reçue depuis {site.quietDays} jours. Vérifiez que le code de suivi est toujours sur votre site.</p>}
            <Detection site={site} />
            {site.snippet && site.status !== "connected" && <Install snippet={site.snippet} platform={site.detected.platform ?? null} />}
            {s.canManage && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost" disabled={busy !== ""} onClick={() => void connect(site.url, "verify")}>{busy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}Vérifier à nouveau</button>
                <button type="button" className="btn btn-ghost text-red-700" disabled={busy !== ""} onClick={async () => {
                  if (!confirm("Déconnecter ce site ? Ses statistiques seront supprimées de MiniSoft.")) return;
                  setBusy("delete");
                  try { setS(await call<State>(base, { method: "DELETE" })); } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); } finally { setBusy(""); }
                }}><Unplug className="h-4 w-4" aria-hidden />Déconnecter le site</button>
              </div>
            )}
            {site.snippet && site.status === "connected" && <details className="rounded-xl border border-slate-200 p-4 text-sm"><summary className="cursor-pointer font-medium text-slate-700">Code de suivi et événements de conversion</summary><Install snippet={site.snippet} platform={site.detected.platform ?? null} compact /></details>}
          </div>
        )}
      </section>

      {site && (site.status === "connected" ? <Dashboard base={base} profile={s.profile} /> : <EmptyDashboard pending={site.status === "pending"} />)}
    </div>
  );
}

function StatusPill({ site }: { site: SiteView }) {
  const m = site.status === "connected" ? ["Connecté", "bg-green-50 text-green-800 ring-green-200", Check] : site.status === "error" ? ["Erreur", "bg-red-50 text-red-800 ring-red-200", CircleAlert] : ["Non connecté · en attente du code", "bg-amber-50 text-amber-900 ring-amber-200", Clock];
  const [label, cls, Icon] = m as [string, string, typeof Check];
  return <span role="status" className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${cls}`}><Icon className="h-4 w-4" aria-hidden />{label}</span>;
}

function Detection({ site }: { site: SiteView }) {
  const d = site.detected;
  if (!d.reachable) return null;
  const connected = site.status === "connected";
  return (
    <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
      <p className="font-semibold text-slate-900">Ce que nous avons trouvé sur votre site{d.checkedAt ? ` (${when(d.checkedAt)})` : ""}</p>
      <ul className="mt-2 space-y-1">
        <li>✓ Le site répond.</li>
        {connected ? <li>✓ Visites reçues : le code de suivi fonctionne.</li> : <li>{d.snippet ? "✓ Code de suivi MiniSoft présent sur la page d'accueil : en attente de la première visite." : "○ Code de suivi MiniSoft pas encore présent sur la page d'accueil."}</li>}
        {d.platform && <li>• Plateforme : {d.platform}{d.api ? ` · ${d.api} détectée` : ""}.</li>}
        {(d.tools ?? []).map((t) => <li key={t.id}>• {t.label}{t.detail ? ` (${t.detail})` : ""} détecté.</li>)}
      </ul>
      {(d.tools ?? []).length > 0 && <p className="mt-2 text-xs text-slate-500">La lecture directe des statistiques de ces outils (Google Analytics…) demande votre autorisation chez eux et n&apos;est pas encore disponible : le code MiniSoft ci-dessous fonctionne à côté, sans les remplacer.</p>}
    </div>
  );
}

function Install({ snippet, platform, compact }: { snippet: string; platform: string | null; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const where: Record<string, string> = {
    WordPress: "WordPress : Apparence → Éditeur de thème (header.php) avant </head>, ou une extension « Insérer en-tête et pied de page ».",
    Wix: "Wix : Paramètres → Code personnalisé → Ajouter dans l'en-tête, sur toutes les pages.",
    Shopify: "Shopify : Boutique en ligne → Thèmes → Modifier le code → theme.liquid, avant </head>.",
    Squarespace: "Squarespace : Paramètres → Avancé → Injection de code → En-tête.",
  };
  return (
    <div className={compact ? "mt-3 space-y-3" : "space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4 text-sm"}>
      {!compact && <p className="font-semibold text-slate-900">Dernière étape : collez ce code dans votre site</p>}
      <p className="text-slate-600">{platform && where[platform] ? where[platform] : "Collez-le dans l'en-tête (<head>) de toutes les pages de votre site, ou demandez-le à la personne qui gère votre site."} Le statut passe à « Connecté » dès la première visite reçue.</p>
      <div className="flex items-start gap-2">
        <code className="block min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg bg-slate-900 px-3 py-2.5 text-xs text-green-300">{snippet}</code>
        <button type="button" className="btn btn-ghost shrink-0" onClick={async () => { await navigator.clipboard.writeText(snippet).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}{copied ? "Copié" : "Copier"}</button>
      </div>
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer font-medium">Compter les commandes, réservations, devis…</summary>
        <p className="mt-2">Les appels, WhatsApp et e-mails cliqués sont comptés tout seuls comme demandes de contact, et les pages « menu », « chambres » ou « services » comme consultations. Pour une commande ou une réservation, ajoutez <code>data-minisoft=&quot;commande&quot;</code> (ou <code>reservation</code>, <code>devis</code>, <code>rendez_vous</code>, <code>demande_reservation</code>, <code>contact</code>) sur le bouton ou le formulaire, ou appelez <code>minisoft(&apos;commande&apos;)</code> après la confirmation.</p>
        <p className="mt-2">Confidentialité : aucun cookie, aucune adresse IP conservée, « Ne pas me pister » respecté. Pour attendre l&apos;accord du visiteur, ajoutez <code>data-consent=&quot;required&quot;</code> et appelez <code>minisoft(&apos;consent&apos;)</code> quand il accepte.</p>
      </details>
    </div>
  );
}

function EmptyDashboard({ pending }: { pending: boolean }) {
  return (
    <section className="glass rounded-2xl p-6 text-center sm:p-10">
      <Activity className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
      <h3 className="mt-3 font-display text-lg font-bold text-slate-900">Tableau de bord des visiteurs</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{pending ? "Il s'affichera dès que votre site aura envoyé sa première visite. Installez le code ci-dessus, puis ouvrez votre site une fois." : "Corrigez l'adresse du site puis vérifiez à nouveau."}</p>
      <p className="mt-2 text-xs text-slate-500">Aucun chiffre n&apos;est affiché tant qu&apos;aucune visite réelle n&apos;a été reçue.</p>
    </section>
  );
}

// ---------- Tableau de bord ----------

function Dashboard({ base, profile }: { base: string; profile: SectorProfile }) {
  const [period, setPeriod] = useState<Period>("7d");
  const [gran, setGran] = useState<Granularity | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await call<{ stats: Stats | null }>(`${base}/stats?period=${period}${gran ? `&g=${gran}` : ""}`);
      setStats(r.stats);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [base, period, gran]);
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const grans: Granularity[] = period === "today" ? ["hour"] : period === "7d" ? ["day"] : period === "30d" ? ["day", "week"] : ["day", "week", "month"];
  const t = stats?.totals;
  const p = stats?.previous;
  return (
    <section className="space-y-4" aria-busy={loading}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Période" className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1 sm:flex">
          {PERIODS.map((x) => (
            <button key={x} role="tab" aria-selected={period === x} onClick={() => (setPeriod(x), setGran(null))} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm ${period === x ? "bg-blue-600 font-semibold text-white" : "text-slate-600 hover:bg-slate-50"}`}>{PERIOD_LABELS[x]}</button>
          ))}
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-full bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-800 ring-1 ring-green-200" title="Visiteurs actifs ces 5 dernières minutes">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" /></span>
          {stats ? nf(stats.realtime) : "…"} en ce moment
        </span>
      </div>
      {err && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}
      {stats?.truncated && <p className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-900">Période très chargée : seules les 200 000 premières visites sont comptées.</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Users} label="Visiteurs" value={t ? nf(t.visitors) : "…"} delta={t && change(t.visitors, p?.visitors)} hint="Un visiteur par jour où il est venu" />
        <Kpi icon={Users} label="Visiteurs uniques" value={t ? nf(t.uniqueVisitors) : "…"} delta={t && change(t.uniqueVisitors, p?.uniqueVisitors)} hint="Personnes distinctes (reconnues sans cookie, au sein d'un même mois)" />
        <Kpi icon={MousePointerClick} label="Visites" value={t ? nf(t.visits) : "…"} delta={t && change(t.visits, p?.visits)} hint="Une visite se termine après 30 min sans activité" />
        <Kpi icon={Eye} label="Pages consultées" value={t ? nf(t.pageviews) : "…"} delta={t && change(t.pageviews, p?.pageviews)} />
        <Kpi icon={Clock} label="Durée moyenne" value={t ? dur(t.avgVisitSeconds) : "…"} hint="Temps passé page visible, par visite mesurée" />
        <Kpi icon={Activity} label="Taux de conversion" value={t ? (t.conversionRate == null ? "—" : `${t.conversionRate.toLocaleString("fr-FR")} %`) : "…"} delta={t && p && t.conversionRate != null && p.conversionRate ? Math.round(t.conversionRate - p.conversionRate) : null} deltaUnit=" pt" hint="Visiteurs uniques ayant commandé, réservé ou demandé un contact" />
      </div>

      <div className="glass rounded-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">Évolution des visiteurs</h3>
          {grans.length > 1 && (
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs">
              {grans.map((g) => (
                <button key={g} onClick={() => setGran(g)} className={`rounded-lg px-2.5 py-1 ${(gran ?? stats?.granularity) === g ? "bg-white font-semibold shadow-sm" : "text-slate-600"}`}>{g === "day" ? "Jour" : g === "week" ? "Semaine" : g === "month" ? "Mois" : "Heure"}</button>
              ))}
            </div>
          )}
        </div>
        <Chart points={stats?.series ?? []} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-4 sm:p-6">
          <h3 className="font-semibold text-slate-900">Conversions venant du site</h3>
          <p className="text-xs text-slate-500">Seulement les actions réellement envoyées par votre site sur la période.</p>
          <ul className="mt-4 space-y-3">
            {[...profile.views, ...profile.conversions].map((c) => {
              const v = t?.events[c.type] ?? 0;
              return (
                <li key={c.type} className="flex items-center justify-between gap-3">
                  <span className="min-w-0"><span className="block text-sm font-medium text-slate-800">{c.label}</span><span className="block truncate text-xs text-slate-500">{c.hint}</span></span>
                  <span className="text-xl font-bold tabular-nums text-slate-900">{t ? nf(v) : "…"}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <Bars title="Pages les plus visitées" empty="Aucune page vue sur cette période." rows={(stats?.topPages ?? []).map((x) => ({ key: x.path, label: x.path, value: x.views }))} unit="vues" />
        <div className="glass rounded-2xl p-4 sm:p-6">
          <h3 className="font-semibold text-slate-900">Appareils utilisés</h3>
          <Devices rows={stats?.devices ?? []} />
        </div>
        <Bars title="Pays des visiteurs" note={stats && stats.countryUnknown > 0 ? `${nf(stats.countryUnknown)} visiteur(s) sans pays connu. Pays d'après la connexion du visiteur, sinon le fuseau horaire de son appareil.` : "Pays d'après la connexion du visiteur, sinon le fuseau horaire de son appareil."} empty="Pays non disponible pour ces visites." rows={(stats?.countries ?? []).map((x) => ({ key: x.code, label: x.name, value: x.visitors }))} unit="visiteurs" />
        {(stats?.referrers.length ?? 0) > 0 && <Bars title="Provenance des visites" empty="" rows={(stats?.referrers ?? []).map((x) => ({ key: x.host, label: x.host, value: x.visits }))} unit="visites" />}
      </div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, delta, deltaUnit = " %", hint }: { icon: typeof Users; label: string; value: string; delta?: number | null; deltaUnit?: string; hint?: string }) {
  return (
    <div className="glass rounded-2xl p-4" title={hint}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Icon className="h-3.5 w-3.5" aria-hidden />{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {delta != null ? (
        <p className={`mt-1 inline-flex items-center gap-0.5 text-xs font-semibold ${delta >= 0 ? "text-green-700" : "text-red-700"}`}>{delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}<span className="whitespace-nowrap">{delta > 0 ? "+" : ""}{delta}{deltaUnit}</span> <span className="font-normal text-slate-500">vs avant</span></p>
      ) : (
        <p className="mt-1 text-xs text-slate-400">Pas de comparaison</p>
      )}
    </div>
  );
}

/** Courbe interactive : visiteurs (barres) et pages vues (ligne), valeur détaillée au toucher. */
function Chart({ points }: { points: Stats["series"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [W, setW] = useState(720);
  const box = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e!.contentRect.width))));
    ro.observe(el);
  }, []);
  const max = Math.max(1, ...points.map((x) => Math.max(x.visitors, x.pageviews)));
  const H = 220, pad = 28;
  const bw = points.length ? (W - pad) / points.length : 0;
  const y = (v: number) => H - 22 - (v / max) * (H - 40);
  const line = points.map((x, i) => `${i ? "L" : "M"}${pad + i * bw + bw / 2},${y(x.pageviews)}`).join(" ");
  if (!points.length) return <p className="py-10 text-center text-sm text-slate-500">Chargement…</p>;
  const total = points.reduce((a, b) => a + b.visitors + b.pageviews, 0);
  const h = hover != null ? points[hover] : null;
  const step = Math.ceil(points.length / Math.max(3, Math.floor(W / 80)));
  return (
    <div className="relative mt-4" ref={box}>
      {h && <div className="pointer-events-none absolute right-2 top-0 z-10 rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"><b>{h.label}</b><br />{nf(h.visitors)} visiteur(s) · {nf(h.pageviews)} page(s)</div>}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full" role="img" aria-label="Évolution des visiteurs et des pages consultées" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={pad} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="#E2E8F0" strokeDasharray="4 4" /><text x={0} y={y(max * f) + 4} fontSize="11" fill="#94A3B8">{nf(Math.round(max * f))}</text></g>)}
        {points.map((x, i) => (
          <g key={x.start} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} onClick={() => setHover(i)}>
            <rect x={pad + i * bw} y={0} width={bw} height={H} fill={hover === i ? "#EFF6FF" : "transparent"} />
            <rect x={pad + i * bw + bw * 0.18} y={y(x.visitors)} width={Math.max(2, bw * 0.64)} height={Math.max(0, H - 22 - y(x.visitors))} rx={Math.min(6, bw * 0.2)} fill={hover === i ? "#1D4ED8" : "#3B82F6"} />
            {i % step === 0 && <text x={pad + i * bw + bw / 2} y={H - 6} fontSize="11" fill="#64748B" textAnchor="middle">{x.label}</text>}
          </g>
        ))}
        <path d={line} fill="none" stroke="#FACC15" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-slate-600"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />Visiteurs</span><span className="inline-flex items-center gap-1.5"><span className="h-1 w-4 rounded bg-yellow-400" />Pages consultées</span></div>
      {total === 0 && <p className="mt-2 text-center text-xs text-slate-500">Aucune visite sur cette période.</p>}
    </div>
  );
}

function Bars({ title, rows, unit, empty, note }: { title: string; rows: { key: string; label: string; value: number }[]; unit: string; empty: string; note?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="glass rounded-2xl p-4 sm:p-6">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {note && <p className="text-xs text-slate-500">{note}</p>}
      {rows.length === 0 ? <p className="mt-4 text-sm text-slate-500">{empty}</p> : (
        <ul className="mt-4 space-y-2.5">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex justify-between gap-3 text-sm"><span className="min-w-0 truncate text-slate-700" title={r.label}>{r.label}</span><span className="shrink-0 font-semibold tabular-nums text-slate-900">{nf(r.value)} <span className="font-normal text-slate-500">{unit}</span></span></div>
              <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-500 transition-[width] duration-500" style={{ width: `${(r.value / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Devices({ rows }: { rows: Stats["devices"] }) {
  const total = rows.reduce((a, b) => a + b.visitors, 0);
  const meta = { telephone: ["Téléphone", Smartphone, "#2563EB"], ordinateur: ["Ordinateur", Laptop, "#0B1B3F"], tablette: ["Tablette", Tablet, "#FACC15"] } as const;
  if (!total) return <p className="mt-4 text-sm text-slate-500">Aucune visite sur cette période.</p>;
  return (
    <div className="mt-4">
      <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">{rows.map((r) => <div key={r.device} style={{ width: `${(r.visitors / total) * 100}%`, background: meta[r.device][2] }} />)}</div>
      <ul className="mt-4 grid grid-cols-3 gap-2">
        {rows.map((r) => {
          const [label, Icon, color] = meta[r.device];
          return (
            <li key={r.device} className="rounded-xl bg-slate-50 p-3 text-center">
              <Icon className="mx-auto h-5 w-5" style={{ color }} aria-hidden />
              <p className="mt-1 text-lg font-bold tabular-nums">{Math.round((r.visitors / total) * 100)} %</p>
              <p className="text-xs text-slate-600">{label} · {nf(r.visitors)}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

