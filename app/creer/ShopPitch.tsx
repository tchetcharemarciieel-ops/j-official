"use client";

import { BarChart3, Boxes, Globe, QrCode, ShoppingCart, Smartphone, Sparkles, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Toaster";
import { api, ApiError } from "@/lib/fetcher";
import { SHOP_TYPES, SHOP_TYPE_IDS, type ShopType } from "@/lib/shop/model";

const FEATURES: [typeof ShoppingCart, string][] = [
  [ShoppingCart, "Caisse avec reçus et monnaie"],
  [Boxes, "Stock, variantes, alertes"],
  [Globe, "Boutique en ligne + commandes"],
  [QrCode, "QR code à imprimer"],
  [Users, "Clients, fournisseurs, équipe"],
  [BarChart3, "Ventes, marges, bénéfices"],
  [Smartphone, "Fonctionne sur téléphone"],
  [Sparkles, "Assistant MiniSoft AI"],
];

/** Présentation de MiniSoft Shop dans le parcours de création : choix du commerce, puis création de la boutique. */
export function ShopPitch({ embedded = false, onCancel }: { embedded?: boolean; onCancel?: () => void } = {}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(embedded);
  const [name, setName] = useState("");
  const [type, setType] = useState<ShopType>("vetements");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>("/api/projects", { body: { shop: { name, type } } });
      toast("success", "Votre boutique est créée.");
      router.push(`/projets/${r.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.push(`/connexion?next=${encodeURIComponent("/creer")}`);
      setError(e instanceof Error ? e.message : "Création impossible.");
      setBusy(false);
    }
  }

  const formEl = (
    <form className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-white p-4" onSubmit={(e) => (e.preventDefault(), void create())}>
              <label className="block"><span className="label">Nom de votre boutique</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex. Chez Awa Mode" autoFocus required /></label>
              <label className="block"><span className="label">Type de commerce</span>
                <select className="input" value={type} onChange={(e) => setType(e.target.value as ShopType)}>
                  {SHOP_TYPE_IDS.map((t) => <option key={t} value={t}>{SHOP_TYPES[t].icon} {SHOP_TYPES[t].label}</option>)}
                </select>
              </label>
              {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="flex gap-2">
                <button className="btn btn-primary" disabled={busy || name.trim().length < 2}>{busy ? "Création…" : "Créer ma boutique"}</button>
                <button type="button" className="btn btn-ghost" onClick={() => (embedded ? onCancel?.() : setOpen(false))}>Annuler</button>
              </div>
            </form>
  );
  if (embedded) return formEl;
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-sm" aria-labelledby="shop-title">
      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_220px] sm:p-7">
        <div>
          <span className="inline-block rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">Nouveau</span>
          <h2 id="shop-title" className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">MiniSoft Shop</h2>
          <p className="text-sm font-medium text-blue-700">Gestion complète de boutique</p>
          <p className="mt-2 text-sm text-slate-600">Vendez en boutique et en ligne, suivez votre stock et vos bénéfices, depuis votre téléphone. Pour les boutiques de vêtements, supérettes, parfumeries, téléphones, chaussures, quincailleries…</p>
          <ul className="mt-3 grid gap-x-4 gap-y-1.5 text-sm text-slate-700 sm:grid-cols-2">
            {FEATURES.map(([I, t]) => <li key={t} className="flex items-center gap-2"><I className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />{t}</li>)}
          </ul>
          {!open ? (
            <button className="btn btn-primary mt-5" onClick={() => setOpen(true)}>Créer ma boutique</button>
          ) : (
            formEl
          )}
        </div>
        <div className="hidden items-center justify-center sm:flex" aria-hidden>
          <svg viewBox="0 0 200 240" className="w-full max-w-[200px]">
            <rect x="20" y="8" width="160" height="224" rx="26" fill="#0f172a" />
            <rect x="30" y="24" width="140" height="192" rx="16" fill="#fff" />
            <rect x="40" y="34" width="60" height="9" rx="4" fill="#2563eb" />
            <rect x="40" y="52" width="58" height="42" rx="8" fill="#dbeafe" /><rect x="102" y="52" width="58" height="42" rx="8" fill="#fef3c7" />
            <rect x="40" y="100" width="58" height="42" rx="8" fill="#dcfce7" /><rect x="102" y="100" width="58" height="42" rx="8" fill="#fee2e2" />
            <rect x="40" y="150" width="120" height="8" rx="4" fill="#e2e8f0" /><rect x="40" y="164" width="80" height="8" rx="4" fill="#e2e8f0" />
            <rect x="40" y="184" width="120" height="22" rx="11" fill="#2563eb" />
          </svg>
        </div>
      </div>
    </section>
  );
}
