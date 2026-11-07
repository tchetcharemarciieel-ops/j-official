"use client";

import QRCode from "qrcode";
import { Ban, Copy, Download, Eye, ExternalLink, FlaskConical, ImagePlus, Printer, QrCode, RefreshCw, Send, Smartphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MENU_CATEGORY_LABELS, ORDER_STATUS_LABELS, PAY_STATUS_LABELS, fmtMoney, today, type Doc, type Payment, type Table } from "@/lib/venue/model";
import { onlineSettings, type DayStat, type FullOrder, type OnlineItem } from "@/lib/venue/online";
import { MenuForm, MenuView, PaymentForm } from "../m-sales";
import { shrinkImage } from "../image";
import { MenuStyleEditor } from "./style";
import { ZingoPayCard } from "./zingopay";
import { Btn, Card, Empty, Field, inp, isMgr, Modal, Pill, PrintDoc, Stat, Tabs, useV } from "../ui";

const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");

/** Adresses publiques : menu général et menu d'une table (jeton secret). */
export function usePublicUrls() {
  const { v, mode } = useV();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = v.slug ? `${origin}/r/${v.slug}` : null;
  const test = mode === "live" ? "" : "?demo=1";
  return { base, test, live: mode === "live", available: Boolean(v.slug) };
}

function NoPublicUrl() {
  return <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Démo sans compte : le menu en ligne et les QR codes fonctionnent une fois votre logiciel créé avec un compte (aperçu ou version publiée).</p>;
}

// ---------- Menu en ligne ----------

export function OnlineMenuAdmin() {
  const { v, level, act, settings } = useV();
  const o = onlineSettings(settings);
  const { base, test, live, available } = usePublicUrls();
  const [f, setF] = useState({ published: o.published, ordering: o.ordering, pay_counter: o.pay_counter, kitchen_after_payment: o.kitchen_after_payment, welcome: o.welcome });
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [edit, setEdit] = useState<Doc<OnlineItem> | "new" | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const mgr = isMgr(level);
  const items = (v.data.menu as Doc<OnlineItem>[]).filter((m) => m.data.active).sort((a, b) => a.data.category.localeCompare(b.data.category) || a.data.name.localeCompare(b.data.name));
  return (
    <div className="space-y-4">
      {!available && <NoPublicUrl />}
      <Card title="Publication" actions={<Pill tone={o.published ? "green" : "slate"}>{o.published ? "Publié" : "Non publié"}</Pill>}>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await act("online.settings", { ...f, ...(logo !== undefined ? { logo } : {}) });
            setBusy(false);
          }}
        >
          <Toggle checked={f.published} onChange={(x) => setF({ ...f, published: x })} disabled={!mgr} label="Menu en ligne publié" hint="Visible par les clients qui scannent un QR code." />
          <Toggle checked={f.ordering} onChange={(x) => setF({ ...f, ordering: x })} disabled={!mgr} label="Commande depuis le téléphone" hint="Sinon, le menu est seulement consultable." />
          <Toggle checked={f.pay_counter} onChange={(x) => setF({ ...f, pay_counter: x })} disabled={!mgr} label="Paiement à la caisse ou au serveur" hint="Espèces ou mobile money, confirmé par l'équipe." />
          <Toggle checked={f.kitchen_after_payment} onChange={(x) => setF({ ...f, kitchen_after_payment: x })} disabled={!mgr} label="Envoyer en cuisine seulement après paiement confirmé" hint="Sinon, la commande arrive en cuisine dès sa validation et se règle ensuite." />
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"><b>Paiement en ligne ZingoPay</b> : se règle dans la carte « Paiement en ligne ZingoPay » ci-dessous, avec la clé de votre compte. Aucun paiement n&apos;est simulé en dehors du mode test.</p>
          <Field label="Message d'accueil (facultatif)"><input className={inp} maxLength={300} value={f.welcome} onChange={(e) => setF({ ...f, welcome: e.target.value })} disabled={!mgr} placeholder="Ex. : Bienvenue ! Commandez depuis votre table." /></Field>
          <Field label="Logo (menu et centre des QR codes)">
            <div className="flex flex-wrap items-center gap-2">
              {(logo ?? o.logo) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(logo ?? o.logo)!} alt="Logo" className="h-14 w-14 rounded-xl border border-slate-200 object-cover" />
              ) : (
                <span className="grid h-14 w-14 place-items-center rounded-xl border border-dashed border-slate-300 text-slate-400"><ImagePlus className="h-5 w-5" aria-hidden /></span>
              )}
              {mgr && (
                <label className="btn btn-ghost cursor-pointer !min-h-0 px-3 py-1.5 text-xs">
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                  {(logo ?? o.logo) ? "Changer le logo" : "Ajouter un logo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) setLogo(await shrinkImage(file, 256, "image/png")); }} />
                </label>
              )}
              {mgr && (logo ?? o.logo) && <Btn small kind="ghost" onClick={() => setLogo(null)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Retirer</Btn>}
            </div>
          </Field>
          {mgr && <Btn type="submit" busy={busy}>Enregistrer</Btn>}
        </form>
      </Card>

      {available && <ZingoPayCard />}

      <MenuStyleEditor />

      <Card title="Plats du menu en ligne" actions={<>{mgr && <Btn small onClick={() => setEdit("new")}>Ajouter un plat</Btn>}{available && base && <Btn small kind="ghost" onClick={() => setPreview(true)}><Smartphone className="h-3.5 w-3.5" aria-hidden />Aperçu téléphone</Btn>}</>}>
        {items.length === 0 ? (
          <Empty text="Aucun plat à la carte : ajoutez vos plats avec leur photo, leur prix, une description et leurs options, en une seule fois.">{mgr && <Btn onClick={() => setEdit("new")}>Ajouter le premier plat</Btn>}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                {m.data.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.data.photo} alt="" className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-slate-400"><ImagePlus className="h-4 w-4" aria-hidden /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.data.name} <span className="text-xs font-normal text-slate-500">· {MENU_CATEGORY_LABELS[m.data.category]} · {fmtMoney(m.data.price)}</span></p>
                  <p className="truncate text-xs text-slate-500">{m.data.description || "Pas de description"}{m.data.options?.length ? ` · ${m.data.options.length} option(s)` : ""}</p>
                </div>
                {m.data.available === false ? <Pill tone="red">Épuisé</Pill> : <Pill tone="green">Disponible</Pill>}
                {level >= 1 && <Btn small kind="ghost" onClick={() => act("online.available", { menu_id: m.id, available: m.data.available === false })}>{m.data.available === false ? "Remettre" : "Épuisé"}</Btn>}
                {mgr && <Btn small kind="ghost" onClick={() => setEdit(m)}>Modifier</Btn>}
              </li>
            ))}
          </ul>
        )}
        <details className="mt-3 rounded-xl border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-medium">Voir toute la carte (y compris les articles désactivés)</summary><div className="mt-3"><MenuView /></div></details>
      </Card>
      {edit && <MenuForm item={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {preview && base && (
        <Modal title="Aperçu sur téléphone" onClose={() => setPreview(false)}>
          <div className="mx-auto h-[640px] w-[340px] overflow-hidden rounded-[2rem] border-8 border-slate-900 bg-white">
            <iframe title="Aperçu du menu" src={`${base}${test}`} className="h-full w-full" />
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">{live ? (o.published ? "Menu réel, tel que vos clients le voient." : "Le menu n'est pas encore publié : les clients voient ce message.") : "Aperçu en mode test (commandes de démonstration, aucun paiement réel)."}</p>
        </Modal>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
    </label>
  );
}

// ---------- Commandes en ligne (caisse) ----------

export function OnlineOrders() {
  const { v, act, level, api, mode, projectId } = useV();
  const [pay, setPay] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState(() => new Date());
  // Écran de commandes : vérification rapide des nouveautés (toutes les 3 s).
  const { setFast, reload } = api;
  useEffect(() => {
    setFast(true);
    return () => setFast(false);
  }, [setFast]);
  useEffect(() => setUpdated(new Date()), [v]);
  const zpPending = (v.data.order as Doc<FullOrder>[]).some((o) => o.data.pay_mode === "zingopay" && o.data.zp && o.data.pay_status !== "paye" && o.data.status !== "annulee" && Date.now() - Date.parse(o.created_at) < 3 * 3_600_000);
  const checkZp = useCallback(async () => {
    if (mode === "local") return 0;
    const r = await fetch(`/api/projects/${projectId}/zingopay/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) }).then((x) => x.json()).catch(() => ({}));
    if (r.paid) await reload();
    return Number(r.paid ?? 0);
  }, [mode, projectId, reload]);
  // Commandes ZingoPay en attente : on relit leur statut chez ZingoPay toutes les 5 s.
  useEffect(() => {
    if (!zpPending) return;
    void checkZp();
    const t = setInterval(() => document.visibilityState === "visible" && void checkZp(), 5_000);
    return () => clearInterval(t);
  }, [zpPending, checkZp]);
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([reload(), zpPending ? checkZp() : Promise.resolve(0)]);
    setUpdated(new Date());
    setRefreshing(false);
  };
  const tables = v.data.table as Doc<Table>[];
  const pays = v.data.payment as Doc<Payment>[];
  const orders = (v.data.order as Doc<FullOrder>[]).filter((o) => o.data.channel === "qr" && o.created_at.slice(0, 10) >= today(new Date(Date.now() - 2 * 86_400_000))).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pendingPay = (o: Doc<FullOrder>) => pays.some((p) => p.data.target === "order" && p.data.target_id === o.id && p.data.status === "en_attente");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-slate-500">Commandes des clients par QR code (2 derniers jours). Mise à jour automatique toutes les 3 secondes · dernière à {updated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.</p>
        <Btn small kind="ghost" busy={refreshing} onClick={refresh}><RefreshCw className="h-3.5 w-3.5" aria-hidden />Actualiser</Btn>
      </div>
      {orders.length === 0 ? (
        <Empty text="Aucune commande en ligne pour le moment." icon={QrCode} />
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold">{o.data.number}</span>
                <span className="text-xs text-slate-500">{o.data.table_id ? `Table ${tables.find((t) => t.id === o.data.table_id)?.data.number ?? "?"}` : "Sans table"} · {hhmm(o.created_at)}{o.data.customer ? ` · ${o.data.customer}` : ""}</span>
                <span className="ml-auto font-semibold">{fmtMoney(o.data.total)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{o.data.lines.map((l) => `${l.qty} × ${l.label}`).join(", ")}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Pill>{ORDER_STATUS_LABELS[o.data.status]}</Pill>
                <Pill tone={o.data.pay_status === "paye" ? "green" : pendingPay(o) ? "amber" : "slate"}>{pendingPay(o) ? "Paiement en attente de confirmation" : PAY_STATUS_LABELS[o.data.pay_status]}</Pill>
                {o.data.pay_mode === "zingopay" && <Pill tone={o.data.pay_status === "paye" ? "green" : "blue"}>{o.data.pay_status === "paye" ? "Payée avec ZingoPay" : "ZingoPay : paiement en cours"}</Pill>}
                {o.data.held && <Pill tone="amber">Retenue : en attente du paiement</Pill>}
                {o.data.problem && <Pill tone="red">Problème : {o.data.problem.text}</Pill>}
              </div>
              {level >= 1 && o.data.status !== "annulee" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {o.data.pay_status !== "paye" && <Btn small onClick={() => setPay(o.id)}>Encaisser</Btn>}
                  {o.data.held && <Btn small kind="ghost" onClick={() => act("online.release", { id: o.id }, { confirm: "Envoyer en cuisine avant le paiement ? Le paiement restera à encaisser." })}><Send className="h-3.5 w-3.5" aria-hidden />Envoyer en cuisine</Btn>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {pay && <PaymentForm target="order" targetId={pay} onClose={() => setPay(null)} />}
    </div>
  );
}

// ---------- QR codes ----------

/** Dessine un QR code (avec logo au centre si demandé : correction d'erreur élevée pour rester lisible). */
async function qrCanvas(url: string, size: number, logo: string | null): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  await QRCode.toCanvas(c, url, { width: size, margin: 2, errorCorrectionLevel: logo ? "H" : "M", color: { dark: "#0f172a", light: "#ffffff" } });
  if (logo) {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = logo;
    });
    const ctx = c.getContext("2d")!;
    // Logo limité à 20 % de la largeur, sur fond blanc : le code reste lisible grâce au niveau H.
    const s = Math.round(size * 0.2);
    const x = Math.round((size - s) / 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - 6, x - 6, s + 12, s + 12);
    ctx.drawImage(img, x, x, s, s);
  }
  return c;
}

function QrImage({ url, logo, size = 220 }: { url: string; logo: string | null; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    void qrCanvas(url, size * 2, logo).then((c) => alive && setSrc(c.toDataURL("image/png")));
    return () => {
      alive = false;
    };
  }, [url, logo, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={`QR code vers ${url}`} width={size} height={size} className="rounded-lg" /> : <span className="block animate-pulse rounded-lg bg-slate-100" style={{ width: size, height: size }} />;
}

export function QrCodesView() {
  const { v, level, act, settings, appName } = useV();
  const o = onlineSettings(settings);
  const { base, test, available } = usePublicUrls();
  const [withLogo, setWithLogo] = useState(Boolean(o.logo));
  const [print, setPrint] = useState(false);
  const [tab, setTab] = useState<"codes" | "stats">("codes");
  const mgr = isMgr(level);
  const tables = (v.data.table as Doc<Table>[]).filter((t) => t.data.active).sort((a, b) => a.data.number.localeCompare(b.data.number, "fr", { numeric: true }));
  const logo = withLogo ? o.logo : null;
  const menuUrl = base && o.menu_token ? `${base}?q=${o.menu_token}` : null;
  const tableUrl = (t: Doc<Table>) => (base && t.data.qr_token ? `${base}/t/${t.data.qr_token}` : null);
  const png = async (url: string, name: string) => {
    const c = await qrCanvas(url, 1024, logo);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${name}.png`;
    a.click();
  };
  const codes = [...(menuUrl ? [{ key: "menu", label: "Menu général", url: menuUrl, active: o.menu_qr_active }] : []), ...tables.filter((t) => tableUrl(t)).map((t) => ({ key: t.id, label: `Table ${t.data.number}`, url: tableUrl(t)!, active: t.data.qr_active !== false }))];

  if (!available) return <NoPublicUrl />;
  return (
    <div className="space-y-4">
      <Tabs label="QR codes" value={tab} onChange={setTab} tabs={[{ id: "codes", label: "QR codes", icon: QrCode }, { id: "stats", label: "Statistiques", icon: Eye }]} />
      {tab === "stats" ? (
        <QrStats />
      ) : (
        <>
          {!o.published && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Le menu en ligne n&apos;est pas publié : les clients verront « menu non publié ». Publiez-le dans « Menu en ligne ». Vous pouvez tester en mode démonstration.</p>}
          <Card title="Options" actions={codes.length > 0 && <Btn small onClick={() => setPrint(true)}><Printer className="h-3.5 w-3.5" aria-hidden />Imprimer / PDF</Btn>}>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withLogo} disabled={!o.logo} onChange={(e) => setWithLogo(e.target.checked)} />Logo au centre {o.logo ? "(correction d'erreur élevée pour rester lisible)" : "(ajoutez un logo dans « Menu en ligne »)"}</label>
            <p className="mt-2 text-xs text-slate-500">Les QR codes ne contiennent qu&apos;une adresse avec un identifiant aléatoire : aucune donnée secrète. Le client ne peut pas changer la table de sa commande.</p>
          </Card>
          <Card title="Menu général">
            {menuUrl ? (
              <QrRow label="Menu général" url={menuUrl} active={o.menu_qr_active} logo={logo} test={test} mgr={mgr} onPng={() => png(menuUrl, "qr-menu")} onRegen={() => act("qr.menu", { action: "generate" }, { confirm: "Régénérer ce QR code ? L'ancien, déjà imprimé, ne fonctionnera plus." })} onToggle={() => act("qr.menu", { action: o.menu_qr_active ? "disable" : "enable" })} />
            ) : mgr ? (
              <Btn small onClick={() => act("qr.menu", { action: "generate" })}><QrCode className="h-3.5 w-3.5" aria-hidden />Créer le QR code du menu</Btn>
            ) : (
              <p className="text-sm text-slate-500">Pas encore créé.</p>
            )}
          </Card>
          <Card title="Tables" actions={mgr && tables.some((t) => !t.data.qr_token) && <Btn small onClick={async () => { for (const t of tables.filter((x) => !x.data.qr_token)) await act("qr.table", { table_id: t.id, action: "generate" }, { quiet: true }); }}><QrCode className="h-3.5 w-3.5" aria-hidden />Créer les QR codes manquants</Btn>}>
            {tables.length === 0 ? (
              <Empty text="Aucune table : ajoutez vos tables (zone Salle de restaurant ou Vision IA) pour créer leurs QR codes." />
            ) : (
              <ul className="space-y-3">
                {tables.map((t) => {
                  const url = tableUrl(t);
                  return (
                    <li key={t.id}>
                      {url ? (
                        <QrRow label={`Table ${t.data.number}`} url={url} active={t.data.qr_active !== false} logo={logo} test={test} mgr={mgr} onPng={() => png(url, `qr-table-${t.data.number}`)} onRegen={() => act("qr.table", { table_id: t.id, action: "generate" }, { confirm: `Régénérer le QR code de la table ${t.data.number} ? L'ancien ne fonctionnera plus.` })} onToggle={() => act("qr.table", { table_id: t.id, action: t.data.qr_active === false ? "enable" : "disable" })} />
                      ) : (
                        <div className="flex items-center justify-between rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm"><span>Table {t.data.number} : pas de QR code</span>{mgr && <Btn small kind="ghost" onClick={() => act("qr.table", { table_id: t.id, action: "generate" })}>Créer</Btn>}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
      {print && (
        <PrintDoc title="QR codes à imprimer" onClose={() => setPrint(false)}>
          <p className="no-print mb-3 text-xs text-slate-500">Pour un PDF : « Imprimer / PDF », puis choisissez « Enregistrer au format PDF ». Seuls les QR codes actifs sont imprimés.</p>
          <div className="grid grid-cols-2 gap-4">
            {codes.filter((c) => c.active).map((c) => (
              <div key={c.key} className="break-inside-avoid rounded-2xl border-2 border-slate-900 p-4 text-center">
                <p className="text-lg font-bold">{appName}</p>
                <div className="my-2 flex justify-center"><QrImage url={c.url} logo={logo} size={200} /></div>
                <p className="text-xl font-extrabold">{c.label}</p>
                <p className="text-xs">Scannez pour voir le menu{o.ordering ? " et commander" : ""}</p>
                <p className="mt-1 text-[10px] text-slate-500">Aucune application à installer</p>
              </div>
            ))}
          </div>
        </PrintDoc>
      )}
    </div>
  );
}

function QrRow({ label, url, active, logo, test, mgr, onPng, onRegen, onToggle }: { label: string; url: string; active: boolean; logo: string | null; test: string; mgr: boolean; onPng: () => void; onRegen: () => void; onToggle: () => void }) {
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center ${active ? "border-slate-200" : "border-red-200 bg-red-50/40"}`}>
      <div className={active ? "" : "opacity-40"}><QrImage url={url} logo={logo} size={120} /></div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-semibold">{label} {!active && <span className="text-xs font-normal text-red-600">· désactivé (affiche un message explicatif)</span>}</p>
        <p className="truncate text-xs text-slate-500">{url}</p>
        <div className="flex flex-wrap gap-1.5">
          <Btn small kind="ghost" onClick={onPng}><Download className="h-3.5 w-3.5" aria-hidden />PNG</Btn>
          <Btn small kind="ghost" onClick={() => navigator.clipboard?.writeText(url)}><Copy className="h-3.5 w-3.5" aria-hidden />Copier</Btn>
          <a href={`${url}${url.includes("?") ? test.replace("?", "&") : test}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">{test ? <FlaskConical className="h-3.5 w-3.5" aria-hidden /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden />}{test ? "Tester (démo)" : "Ouvrir"}</a>
          {mgr && <Btn small kind="ghost" onClick={onRegen}><RefreshCw className="h-3.5 w-3.5" aria-hidden />Régénérer</Btn>}
          {mgr && <Btn small kind="ghost" onClick={onToggle}><Ban className="h-3.5 w-3.5" aria-hidden />{active ? "Désactiver" : "Réactiver"}</Btn>}
        </div>
      </div>
    </div>
  );
}

function QrStats() {
  const { v } = useV();
  const days = v.data.qstat as Doc<DayStat>[];
  const since = today(new Date(Date.now() - 29 * 86_400_000));
  const inP = days.filter((d) => d.data.date >= since);
  const scans = inP.reduce((a, d) => a + Object.values(d.data.scans).reduce((x, y) => x + y, 0), 0);
  const visitors = inP.reduce((a, d) => a + d.data.visitors.length, 0);
  const orders = inP.reduce((a, d) => a + d.data.orders, 0);
  const views = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of inP) for (const [k, n] of Object.entries(d.data.views)) m.set(k, (m.get(k) ?? 0) + n);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [inP]);
  const menu = v.data.menu as Doc<OnlineItem>[];
  return (
    <Card title="30 derniers jours">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Scans" value={scans} />
        <Stat label="Visiteurs (uniques par jour)" value={visitors} />
        <Stat label="Commandes générées" value={orders} tone="green" />
        <Stat label="Taux de commande" value={visitors ? `${Math.round((orders / visitors) * 100)} %` : "—"} />
      </div>
      <h5 className="mb-1 mt-4 text-xs font-semibold text-slate-600">Plats les plus consultés</h5>
      {views.length === 0 ? <p className="text-sm text-slate-500">Pas encore de données.</p> : <ul className="space-y-1 text-sm">{views.map(([id, n]) => <li key={id} className="flex justify-between"><span>{menu.find((m) => m.id === id)?.data.name ?? "Plat retiré"}</span><span className="font-semibold">{n}</span></li>)}</ul>}
      <p className="mt-3 text-[11px] text-slate-500">Compteurs anonymes : aucun nom, aucune adresse, aucun numéro de téléphone n&apos;est enregistré.</p>
    </Card>
  );
}
