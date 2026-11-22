"use client";

import { Copy, Download, ExternalLink, MessageCircle, Printer, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { Settings } from "@/lib/shop/model";
import { useCtx } from "../context";
import { printHtml } from "../print";
import { Card, Field } from "../ui";
import { ImagePick } from "./Settings";
import { ZingoPayCard } from "../ZingoPayCard";

/** Boutique en ligne : publication, personnalisation, lien public et QR code. */
export function Online() {
  const c = useCtx();
  const [f, setF] = useState(c.settings);
  const [qr, setQr] = useState("");
  const url = `${location.origin}/shop/${c.s.slug}`;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF((x) => ({ ...x, [k]: v }));
  const setOn = (k: keyof Settings["online"], v: boolean) => setF((x) => ({ ...x, online: { ...x.online, [k]: v } }));
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } }).then((d) => alive && setQr(d));
    return () => {
      alive = false;
    };
  }, [url]);
  const published = c.settings.online.published;
  const save = () => c.run("settings.save", { ...c.settings, ...f });
  const share = async () => {
    const text = `${c.settings.name} : commandez en ligne 👉 ${url}`;
    if (navigator.share) await navigator.share({ text }).catch(() => undefined);
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const downloadPng = () => {
    const a = document.createElement("a");
    a.href = qr;
    a.download = `qr-${c.s.slug}.png`;
    a.click();
  };
  const posterHtml = () => `<!doctype html><html><head><meta charset="utf-8"><title>QR ${c.settings.name}</title><style>@page{size:A4;margin:0}body{margin:0;font-family:system-ui,sans-serif;text-align:center;padding:60px 40px}h1{font-size:44px;margin:0 0 10px}p{font-size:22px;color:#334155}img.q{width:520px;height:520px;margin:30px auto;display:block}.u{font-size:20px;color:#0f172a;word-break:break-all}.b{margin-top:40px;font-size:14px;color:#94a3b8}</style></head><body><h1>${c.settings.name.replace(/</g, "&lt;")}</h1><p>Scannez pour voir nos produits et commander</p><img class="q" src="${qr}" alt="QR code"><p class="u">${url}</p><p class="b">MiniSoft Shop</p></body></html>`;
  const copy = async () => {
    await navigator.clipboard?.writeText(url).then(() => c.notify("success", "Lien copié."), () => c.notify("error", "Copie impossible : sélectionnez le lien."));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card title="Lien public de votre boutique" subtitle={published ? "Votre boutique est en ligne." : "Votre boutique n'est pas encore publiée : personne d'autre que vous ne peut la voir."}>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-slate-100 px-3 py-2 text-sm">{url}</code>
          <button className="btn btn-ghost" onClick={copy}><Copy className="h-4 w-4" /> Copier</button>
          <button className="btn btn-ghost" onClick={share}><MessageCircle className="h-4 w-4" /> Partager</button>
          <a className="btn btn-ghost" href={published ? url : `${url}?test=1`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> {published ? "Ouvrir" : "Aperçu"}</a>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr ? <img src={qr} alt={`QR code de ${c.settings.name}`} className="h-36 w-36 rounded-xl border border-slate-200" /> : <QrCode className="h-10 w-10 text-slate-300" />}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={downloadPng} disabled={!qr}><Download className="h-4 w-4" /> QR code (PNG)</button>
            <button className="btn btn-ghost" onClick={() => printHtml(posterHtml())} disabled={!qr}><Printer className="h-4 w-4" /> Imprimer l'affiche / PDF</button>
          </div>
          <p className="w-full text-xs text-slate-500">Pour le PDF, choisissez « Enregistrer au format PDF » dans la fenêtre d'impression. Le QR code mène à la page de la boutique ; il reste valable même si vous changez les produits.</p>
        </div>
      </Card>

      <Card title="Publication">
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.online.published} onChange={(e) => setOn("published", e.target.checked)} /><span><b>Publier ma boutique en ligne</b><br /><span className="text-slate-500">Seuls les produits cochés « Visible dans la boutique en ligne » (et disponibles) sont montrés.</span></span></label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.online.ordering} onChange={(e) => setOn("ordering", e.target.checked)} /><span><b>Accepter les commandes</b><br /><span className="text-slate-500">Sinon la boutique est une vitrine : catalogue et bouton WhatsApp, sans panier.</span></span></label>
        </div>
      </Card>

      <Card title="Remise des commandes et paiement">
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.pickup.enabled} onChange={(e) => set("pickup", { ...f.pickup, enabled: e.target.checked })} /><span><b>Retrait en boutique</b></span></label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.delivery.enabled} onChange={(e) => set("delivery", { ...f.delivery, enabled: e.target.checked })} /><span><b>Livraison</b></span></label>
          {f.delivery.enabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Frais de livraison (FCFA)"><input className="input" inputMode="numeric" value={f.delivery.fee} onChange={(e) => set("delivery", { ...f.delivery, fee: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></Field>
              <Field label="Informations de livraison" hint="Zones, délais…"><input className="input" value={f.delivery.info} onChange={(e) => set("delivery", { ...f.delivery, info: e.target.value })} maxLength={300} /></Field>
            </div>
          )}
          <p className="pt-1 font-medium">Moyens de paiement proposés aux clients (deux seulement)</p>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.online.pay_delivery} onChange={(e) => setOn("pay_delivery", e.target.checked)} /><span>Paiement à la livraison<br /><span className="text-slate-500">Le client ne paie rien à la commande. Le paiement est noté « encaissé » seulement quand vous confirmez avoir reçu l&apos;argent.</span></span></label>
          <label className={`flex items-start gap-2 ${c.s.zingopay ? "" : "opacity-60"}`}><input type="checkbox" className="mt-1" disabled={!c.s.zingopay} checked={f.online.zingopay && c.s.zingopay} onChange={(e) => setOn("zingopay", e.target.checked)} /><span>Paiement en ligne ZingoPay (ALETCHCARD){!c.s.zingopay && <><br /><span className="text-slate-500">Non activé : ajoutez votre clé ZingoPay dans la carte « Paiement en ligne ZingoPay » en bas de cette page. La commande n'est confirmée qu'après la confirmation de ZingoPay.</span></>}</span></label>
        </div>
      </Card>

      <Card title="Apparence de la boutique">
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <ImagePick label="Logo" kind="logo" id={f.logo_id} onChange={(id) => set("logo_id", id)} />
            <ImagePick label="Bannière" kind="banner" wide id={f.banner_id} onChange={(id) => set("banner_id", id)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Couleur principale"><input type="color" className="h-11 w-full cursor-pointer rounded-xl border border-slate-300 bg-transparent" value={f.primary} onChange={(e) => set("primary", e.target.value)} /></Field>
            <Field label="Texte d'accueil"><input className="input" value={f.welcome} onChange={(e) => set("welcome", e.target.value)} maxLength={300} placeholder="Bienvenue ! Livraison à Bangui." /></Field>
          </div>
          <Field label="Description de la boutique"><textarea className="input" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={600} /></Field>
          <p className="text-xs text-slate-500">Coordonnées, horaires et numéro WhatsApp se règlent dans « Réglages ».</p>
        </div>
      </Card>
      <div className="flex justify-end"><button className="btn btn-primary" onClick={() => void save()}>Enregistrer</button></div>
      <ZingoPayCard />
    </div>
  );
}
