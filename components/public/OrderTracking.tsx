"use client";

import { Bell, BellOff, Check, ChefHat, CircleAlert, Copy, CreditCard, FlaskConical, PartyPopper, Receipt, Utensils } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TRACK_LABELS, TRACK_STEPS, type PublicOrder, type TrackStep } from "@/lib/venue/online";

const money = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "");
const ICONS: Record<TrackStep, typeof Check> = { recue: Receipt, payee: CreditCard, acceptee: Check, preparation: ChefHat, prete: PartyPopper, servie: Utensils };
/** Messages affichés (et notifiés) à chaque nouvelle étape. */
const NOTIFY: Partial<Record<TrackStep, string>> = { payee: "Paiement confirmé.", acceptee: "Votre commande a été acceptée par la cuisine.", preparation: "Votre commande est en préparation.", prete: "Votre commande est prête !" };

/**
 * Suivi de commande accessible par un lien secret, mis à jour automatiquement. Le paiement
 * n'apparaît « confirmé » qu'après la confirmation enregistrée par le restaurant (ou, plus tard,
 * la confirmation officielle d'ALETCHCARD) : jamais d'après une simple redirection.
 */
export function OrderTracking({ slug, token, demo, fresh, sessionKey, payError }: { slug: string; token: string; demo: boolean; fresh: boolean; sessionKey: string | null; payError?: string | null }) {
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [rest, setRest] = useState<{ name: string; primary: string } | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [notif, setNotif] = useState<NotificationPermission | "indisponible">("default");
  const [menuClosed, setMenuClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const url = `/api/public/track/${token}?r=${encodeURIComponent(slug)}${demo ? "&demo=1" : ""}`;

  useEffect(() => {
    setNotif(typeof Notification === "undefined" ? "indisponible" : Notification.permission);
    if (sessionKey) {
      try {
        setMenuClosed(Boolean(sessionStorage.getItem(`${sessionKey}:closed`)));
      } catch {
        /* rien */
      }
    }
  }, [sessionKey]);

  const announce = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(""), 6000);
    navigator.vibrate?.([120, 60, 120]);
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
      try {
        new Notification(rest?.name ?? "Votre commande", { body: text, tag: token });
      } catch {
        /* certains navigateurs mobiles n'affichent les notifications que par un service de push */
      }
    }
  }, [rest, token]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(url, { cache: "no-store" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Suivi indisponible.");
      const o = b.order as PublicOrder;
      setOrder(o);
      setRest(b.restaurant);
      setError("");
      // Nouvelles étapes depuis le dernier passage : notification (sauf au premier chargement).
      const done = new Set(TRACK_STEPS.filter((s) => o.steps[s]).map(String));
      if (o.problem) done.add(`probleme:${o.problem.at}`);
      if (o.cancelled) done.add("annulee");
      if (seen.current) {
        for (const s of done) if (!seen.current.has(s)) announce(s === "annulee" ? "Votre commande a été annulée. Adressez-vous au serveur." : s.startsWith("probleme") ? `Information du restaurant : ${o.problem?.text}` : (NOTIFY[s as TrackStep] ?? TRACK_LABELS[s as TrackStep]));
      }
      seen.current = done;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suivi indisponible.");
    }
  }, [url, announce]);

  // ZingoPay : relit le statut chez ZingoPay (par le serveur, avec la clé du restaurant).
  const isZp = order?.pay_mode === "zingopay" && !order.paid && !order.cancelled;
  const zpPost = useCallback(async (action: "zp_check" | "zp_start") => {
    const r = await fetch(`/api/public/track/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, r: slug, demo }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error ?? "ZingoPay est indisponible pour le moment.");
    return b as { status?: string; pay_url?: string };
  }, [token, slug, demo]);
  const [zpMsg, setZpMsg] = useState(payError ?? "");
  const checkZp = useCallback(async (manual = false) => {
    try {
      const r = await zpPost("zp_check");
      if (r.status === "paid") await load();
      else if (manual) setZpMsg(r.status === "expired" ? "Le lien de paiement a expiré : touchez « Payer avec ZingoPay » pour en créer un nouveau." : r.status === "cancelled" ? "Ce paiement a été annulé." : "Paiement pas encore reçu par ZingoPay. Si vous venez de payer, patientez quelques secondes.");
    } catch (e) {
      if (manual) setZpMsg(e instanceof Error ? e.message : "Vérification impossible.");
    }
  }, [zpPost, load]);
  useEffect(() => {
    if (!isZp) return;
    void checkZp();
    // Vérification rapide les premières minutes (le client paie en ce moment), puis plus espacée.
    const started = Date.now();
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      t = setTimeout(async () => {
        if (document.visibilityState === "visible") await checkZp();
        tick();
      }, Date.now() - started < 5 * 60_000 ? 3_000 : 10_000);
    };
    tick();
    const v = () => document.visibilityState === "visible" && void checkZp();
    document.addEventListener("visibilitychange", v);
    return () => (clearTimeout(t), document.removeEventListener("visibilitychange", v));
  }, [isZp, checkZp]);
  const payZp = async () => {
    setZpMsg("");
    // Fenêtre ouverte tout de suite (geste de l'utilisateur), puis dirigée vers le lien ZingoPay.
    const w = window.open("", "_blank");
    try {
      const link = order?.zingopay?.pay_url ?? (await zpPost("zp_start")).pay_url;
      if (!link) throw new Error("Lien de paiement indisponible.");
      if (w) w.location.href = link;
      else window.location.href = link;
      await load();
    } catch (e) {
      w?.close();
      setZpMsg(e instanceof Error ? e.message : "Paiement indisponible : payez à la caisse.");
    }
  };

  useEffect(() => {
    void load();
    // Page visible, ou notifications acceptées : on continue de vérifier l'avancement.
    const t = setInterval(() => {
      if (document.visibilityState === "visible" || (typeof Notification !== "undefined" && Notification.permission === "granted")) void load();
    }, 3000);
    return () => clearInterval(t);
  }, [load]);

  const primary = rest?.primary ?? "#2563eb";
  const steps = TRACK_STEPS;
  const closeMenu = () => {
    if (sessionKey) {
      try {
        sessionStorage.setItem(`${sessionKey}:closed`, new Date().toISOString());
        sessionStorage.removeItem(`${sessionKey}:cart`);
      } catch {
        /* rien */
      }
    }
    setMenuClosed(true);
  };

  if (error && !order) return <div className="grid min-h-dvh place-items-center p-6 text-center"><div><CircleAlert className="mx-auto h-10 w-10 text-slate-400" aria-hidden /><p className="mt-2 text-sm text-slate-600">{error}</p></div></div>;
  if (!order) return <div className="grid min-h-dvh place-items-center"><span className="spinner !border-slate-300 !border-t-slate-600" aria-hidden /></div>;

  return (
    <div className="min-h-dvh bg-slate-50 pb-10" style={{ "--app-primary": primary } as React.CSSProperties}>
      {demo && <p className="flex items-center justify-center gap-1.5 bg-amber-100 px-3 py-1.5 text-center text-xs font-semibold text-amber-900"><FlaskConical className="h-3.5 w-3.5" aria-hidden />Mode test : commande de démonstration, aucun paiement réel</p>}
      <header className="bg-white px-4 py-5 text-center shadow-sm">
        <p className="text-sm text-slate-500">{rest?.name}</p>
        <h1 className="text-2xl font-bold">Commande {order.number}</h1>
        <p className="text-sm text-slate-600">{order.table ? `Table ${order.table} · ` : ""}{hhmm(order.created_at)} · {money(order.total)}</p>
      </header>
      {toast && <p role="status" className="sticky top-2 z-20 mx-3 mt-3 rounded-2xl px-4 py-3 text-center font-semibold text-white shadow-lg" style={{ background: primary, animation: "fade-up .25s ease both" }}>{toast}</p>}
      <main className="mx-auto max-w-lg space-y-3 px-3 pt-4">
        {fresh && !menuClosed && (
          <section className="rounded-2xl border-2 border-green-500 bg-white p-4 text-center">
            <Check className="mx-auto h-8 w-8 text-green-600" aria-hidden />
            <p className="mt-1 font-bold">Commande envoyée au restaurant</p>
            <p className="text-sm text-slate-600">Vous pouvez suivre son avancement ci-dessous. Gardez cette page ou son lien.</p>
            <button type="button" onClick={closeMenu} className="mt-3 w-full rounded-full py-3 font-bold text-white" style={{ background: primary }}>OK, c&apos;est bon</button>
            <p className="mt-1.5 text-[11px] text-slate-500">Ferme seulement le menu sur ce téléphone : la commande et son paiement ne sont pas annulés.</p>
          </section>
        )}
        {menuClosed && fresh && <p className="rounded-2xl bg-white p-3 text-center text-sm text-slate-600">Menu fermé sur ce téléphone. Pour commander à nouveau, scannez le QR code de votre table. Le suivi ci-dessous reste disponible.</p>}

        {order.cancelled && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">Commande annulée. Adressez-vous au serveur.</p>}
        {order.problem && !order.cancelled && <p className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><b>Information du restaurant :</b> {order.problem.text}</p>}

        <section className="rounded-2xl bg-white p-4" aria-label="Avancement">
          <ol className="space-y-3">
            {steps.map((s) => {
              const at = order.steps[s];
              const Icon = ICONS[s];
              return (
                <li key={s} className="flex items-center gap-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${at ? "text-white" : "bg-slate-100 text-slate-400"}`} style={at ? { background: primary } : undefined}><Icon className="h-4 w-4" aria-hidden /></span>
                  <span className={`flex-1 text-sm ${at ? "font-semibold text-slate-900" : "text-slate-500"}`}>{TRACK_LABELS[s]}</span>
                  <span className="text-xs text-slate-500">{at ? hhmm(at) : ""}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {order.paid ? (order.pay_mode === "zingopay" ? "Paiement ZingoPay confirmé." : "Paiement confirmé par le restaurant.") : order.pay_mode === "zingopay" ? "Paiement ZingoPay en attente : il apparaîtra « confirmé » dès que ZingoPay l'aura reçu." : order.pay_mode === "demo" ? "Paiement de démonstration non encore confirmé." : "Paiement à régler à la caisse ou au serveur : il apparaîtra « confirmé » dès que le restaurant l'aura enregistré."}
            {order.held && !order.paid ? " Votre commande partira en cuisine dès la confirmation du paiement." : ""}
          </p>
          {isZp && (
            <div className="mt-3 space-y-2">
              {order.zingopay?.test && <p className="text-center text-xs font-semibold text-amber-700">ZingoPay en démonstration : argent fictif</p>}
              <button type="button" onClick={payZp} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#C9A227] py-3.5 text-base font-extrabold text-[#082567] shadow-md">
                <CreditCard className="h-5 w-5" aria-hidden />Payer {money(order.total)} avec ZingoPay
              </button>
              <button type="button" onClick={() => void checkZp(true)} className="w-full rounded-full border border-slate-300 py-2.5 text-sm font-semibold text-slate-700">J&apos;ai payé : vérifier le paiement</button>
              {zpMsg && <p role="status" className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">{zpMsg}</p>}
              <p className="text-center text-[11px] text-slate-500">Vous pouvez aussi payer à la caisse ou au serveur.</p>
            </div>
          )}
          {demo && !order.paid && !order.cancelled && order.pay_mode !== "zingopay" && (
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); await fetch(`/api/public/track/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "demo_pay", r: slug }) }); await load(); setBusy(false); }} className="mt-2 w-full rounded-full border-2 border-dashed border-amber-400 bg-amber-50 py-2.5 text-sm font-semibold text-amber-900">
              Simuler la confirmation officielle du paiement (démo)
            </button>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4">
          <h2 className="mb-2 text-sm font-bold">Détail</h2>
          <ul className="space-y-1.5 text-sm">
            {order.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{l.qty} × {l.label}{l.options.length > 0 && <span className="block text-xs text-slate-500">{l.options.map((o) => o.name).join(", ")}</span>}{l.note && <span className="block text-xs text-amber-700">« {l.note} »</span>}</span>
                <span className="shrink-0 text-slate-600">{money(l.qty * l.unit_price)}</span>
              </li>
            ))}
          </ul>
          {order.note && <p className="mt-2 text-xs text-slate-500">Instructions : {order.note}</p>}
          <p className="mt-2 flex justify-between border-t border-slate-100 pt-2 font-bold"><span>Total</span><span>{money(order.total)}</span></p>
        </section>

        <section className="rounded-2xl bg-white p-4 text-sm">
          {notif === "granted" ? (
            <p className="flex items-center gap-2 text-green-700"><Bell className="h-4 w-4" aria-hidden />Vous serez prévenu sur ce téléphone tant que cette page reste ouverte.</p>
          ) : notif === "denied" || notif === "indisponible" ? (
            <p className="flex items-center gap-2 text-slate-600"><BellOff className="h-4 w-4" aria-hidden />Notifications désactivées : cette page se met à jour toute seule.</p>
          ) : (
            <button type="button" onClick={async () => setNotif(await Notification.requestPermission())} className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 py-2.5 font-semibold">
              <Bell className="h-4 w-4" aria-hidden />Me prévenir quand ma commande avance
            </button>
          )}
          <button type="button" onClick={() => navigator.clipboard?.writeText(window.location.href.split("?")[0] + (demo ? "?demo=1" : "")).then(() => announce("Lien de suivi copié."))} className="mt-2 flex w-full items-center justify-center gap-2 py-1.5 text-slate-600"><Copy className="h-4 w-4" aria-hidden />Copier le lien de suivi</button>
          <p className="mt-1 text-center text-[11px] text-slate-400">Lien personnel et secret : il ne montre que votre commande.</p>
        </section>
      </main>
    </div>
  );
}
