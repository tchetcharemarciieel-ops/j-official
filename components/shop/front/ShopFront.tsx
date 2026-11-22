"use client";

import { ArrowLeft, Check, Clock, Loader2, MapPin, MessageCircle, Minus, Package, Phone, Plus, Search, ShoppingBag, Truck, Store } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Variant = { id: string; label: string; values: Record<string, string>; price: number; available: boolean };
type Item = { id: string; name: string; description: string; category_id: string | null; price: number; unit: string; photos: string[]; available: boolean; few: number | null; attrs: string[]; variants: Variant[] };
type Catalog = {
  shop: { name: string; slug: string; description: string; welcome: string; phone: string; whatsapp: string; email: string; address: string; hours: string; primary: string; logo: string | null; banner: string | null };
  published: boolean;
  ordering: boolean;
  delivery: { fee: number; info: string } | null;
  pickup: { info: string } | null;
  payments: { delivery: boolean; zingopay: boolean; zingopayTest: boolean };
  demo: boolean;
  categories: { id: string; name: string }[];
  items: Item[];
};
type Line = { key: string; product_id: string; variant_id: string | null; name: string; price: number; qty: number };

const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
const waLink = (n: string, text: string) => `https://wa.me/${n.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;

/** Boutique publique : sans compte client, panier gardé sur l'appareil, commande envoyée au commerçant. */
export function ShopFront({ slug, test, initialProduct }: { slug: string; test: boolean; initialProduct?: string | null }) {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState<string | null>(initialProduct ?? null);
  const [cart, setCart] = useState<Line[]>([]);
  const [view, setView] = useState<"shop" | "cart" | "checkout" | "done">("shop");
  const [done, setDone] = useState<{ number: string; tracking: string; pay_url: string | null; pay_error: string | null } | null>(null);
  const key = `msshop-cart:${slug}:${test ? "t" : "l"}`;
  const q1 = test ? "?test=1" : "";
  const img = (id: string) => `/api/public/shop/${slug}/img/${id}${q1}`;

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/shop/${slug}${q1}`, { cache: "no-store" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Boutique indisponible.");
      setCat(b as Catalog);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Boutique indisponible.");
    }
  }, [slug, q1]);
  useEffect(() => {
    void load();
    try {
      const raw = localStorage.getItem(key);
      if (raw) setCart(JSON.parse(raw) as Line[]);
    } catch {
      /* panier non lisible : on repart d'un panier vide */
    }
  }, [load, key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(cart));
    } catch {
      /* stockage indisponible */
    }
  }, [cart, key]);

  const items = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (cat?.items ?? []).filter((i) => (!category || i.category_id === category) && (!n || i.name.toLowerCase().includes(n) || i.description.toLowerCase().includes(n)));
  }, [cat, q, category]);
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const total = cart.reduce((a, l) => a + l.qty * l.price, 0);
  const style = { "--brand": cat?.shop.primary ?? "#2563eb" } as React.CSSProperties;

  if (err)
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-center">
        <div className="max-w-sm"><Store className="mx-auto h-10 w-10 text-slate-400" /><h1 className="mt-3 text-lg font-semibold">{err}</h1><p className="mt-1 text-sm text-slate-500">Vérifiez l&apos;adresse du lien ou contactez le commerçant.</p></div>
      </main>
    );
  if (!cat) return <main className="grid min-h-dvh place-items-center bg-slate-50"><Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Chargement" /></main>;

  const s = cat.shop;
  const product = open ? cat.items.find((i) => i.id === open) : null;
  const add = (p: Item, variant: Variant | null, qty = 1) => {
    const k = `${p.id}:${variant?.id ?? ""}`;
    setCart((x) => {
      const cur = x.find((l) => l.key === k);
      if (cur) return x.map((l) => (l.key === k ? { ...l, qty: Math.min(99, l.qty + qty) } : l));
      return [...x, { key: k, product_id: p.id, variant_id: variant?.id ?? null, name: variant ? `${p.name} — ${variant.label}` : p.name, price: variant?.price ?? p.price, qty }];
    });
  };

  return (
    <div style={style} className="min-h-dvh bg-slate-50 pb-24 text-slate-900">
      {cat.demo && <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">Aperçu avec vos données de test : les clients ne voient pas cette page.</p>}
      {!cat.published && !cat.demo ? null : null}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          {view !== "shop" || product ? (
            <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100" onClick={() => (product ? setOpen(null) : setView(view === "checkout" ? "cart" : "shop"))} aria-label="Retour"><ArrowLeft className="h-5 w-5" /></button>
          ) : s.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img(s.logo)} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand)] text-sm font-bold text-white">{s.name.slice(0, 2).toUpperCase()}</span>
          )}
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{view === "cart" ? "Mon panier" : view === "checkout" ? "Ma commande" : s.name}</h1>
          {cat.ordering && view === "shop" && (
            <button className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100" onClick={() => (setOpen(null), setView("cart"))} aria-label={`Panier : ${count} article(s)`}>
              <ShoppingBag className="h-5 w-5" />
              {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--brand)] px-1 text-[11px] font-bold text-white">{count}</span>}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4">
        {view === "shop" && !product && (
          <>
            <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
              {s.banner ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img(s.banner)} alt="" className="h-36 w-full object-cover sm:h-52" />
              ) : (
                <div className="h-24 bg-gradient-to-r from-[var(--brand)] to-[var(--brand)]/60 sm:h-36" />
              )}
              <div className="p-4 sm:p-6">
                <h2 className="text-xl font-bold">{s.name}</h2>
                {(s.welcome || s.description) && <p className="mt-1 text-slate-600">{s.welcome || s.description}</p>}
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                  {s.address && <li className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{s.address}</li>}
                  {s.hours && <li className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{s.hours}</li>}
                  {s.phone && <li><a className="flex items-center gap-1.5" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}><Phone className="h-4 w-4" />{s.phone}</a></li>}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {cat.pickup && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><Store className="h-3.5 w-3.5" /> Retrait en boutique{cat.pickup.info ? ` · ${cat.pickup.info}` : ""}</span>}
                  {cat.delivery && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><Truck className="h-3.5 w-3.5" /> Livraison {cat.delivery.fee ? fcfa(cat.delivery.fee) : "gratuite"}{cat.delivery.info ? ` · ${cat.delivery.info}` : ""}</span>}
                </div>
                {s.whatsapp && <a className="btn mt-4 bg-[#25D366] text-white hover:brightness-95" href={waLink(s.whatsapp, `Bonjour ${s.name}, je vous contacte depuis votre boutique en ligne.`)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> Écrire sur WhatsApp</a>}
              </div>
            </section>

            {!cat.published && cat.demo && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Votre boutique n&apos;est pas encore publiée (page Boutique en ligne).</p>}
            {!cat.ordering && cat.published && <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">Cette boutique ne prend pas de commande en ligne pour le moment : contactez-nous pour commander.</p>}

            <div className="mt-4 flex items-center gap-2">
              <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input !pl-9" placeholder="Rechercher un produit…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un produit" /></div>
            </div>
            {cat.categories.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {[{ id: "", name: "Tout" }, ...cat.categories].map((c) => <button key={c.id} onClick={() => setCategory(c.id)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${category === c.id ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-slate-300 bg-white"}`}>{c.name}</button>)}
              </div>
            )}
            {items.length === 0 ? (
              <p className="mt-10 text-center text-slate-500">{cat.items.length ? "Aucun produit ne correspond à votre recherche." : "Les produits arrivent bientôt."}</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((p) => (
                  <button key={p.id} onClick={() => setOpen(p.id)} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:shadow-md">
                    <span className="relative grid aspect-square place-items-center bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.photos[0] ? <img src={img(p.photos[0])} alt={p.name} className="h-full w-full object-cover" loading="lazy" /> : <Package className="h-8 w-8 text-slate-300" />}
                      {!p.available && <span className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-semibold text-slate-700">Épuisé</span>}
                    </span>
                    <span className="p-3">
                      <span className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</span>
                      <span className="mt-1 block text-sm font-bold">{p.variants.length > 1 && new Set(p.variants.map((v) => v.price)).size > 1 ? `dès ${fcfa(Math.min(...p.variants.map((v) => v.price)))}` : fcfa(p.price)}</span>
                      {p.few !== null && <span className="text-xs text-amber-700">Plus que {p.few}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {view === "shop" && product && <ProductPage p={product} cat={cat} img={img} ordering={cat.ordering} onAdd={(v, n) => (add(product, v, n), setView("cart"), setOpen(null))} />}
        {view === "cart" && <CartView cart={cat.ordering ? cart : []} setCart={setCart} total={total} onCheckout={() => setView("checkout")} onBack={() => setView("shop")} />}
        {view === "checkout" && <Checkout slug={slug} cat={cat} cart={cart} total={total} test={test} onDone={(d) => (setDone(d), setCart([]), setView("done"))} onStale={() => void load()} />}
        {view === "done" && done && <Done d={done} slug={slug} q1={q1} name={s.name} whatsapp={s.whatsapp} onBack={() => (setView("shop"), setDone(null))} />}
      </main>

      {cat.ordering && view === "shop" && count > 0 && !product && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button className="btn btn-primary mx-auto flex w-full max-w-md justify-between !py-3" onClick={() => setView("cart")}><span>Voir mon panier ({count})</span><span>{fcfa(total)}</span></button>
        </div>
      )}
      <footer className="mx-auto max-w-5xl px-4 pb-6 text-center text-xs text-slate-400">Boutique propulsée par <Link href="/" className="underline">MiniSoft Shop</Link></footer>
    </div>
  );
}

function ProductPage({ p, cat, img, ordering, onAdd }: { p: Item; cat: Catalog; img: (id: string) => string; ordering: boolean; onAdd: (v: Variant | null, qty: number) => void }) {
  const [photo, setPhoto] = useState(0);
  const [vid, setVid] = useState<string>("");
  const [qty, setQty] = useState(1);
  const v = p.variants.find((x) => x.id === vid) ?? null;
  const need = p.variants.length > 0 && !v;
  const price = v?.price ?? p.price;
  const ok = p.available && (!v || v.available);
  return (
    <article className="grid gap-6 md:grid-cols-2">
      <div>
        <div className="grid aspect-square place-items-center overflow-hidden rounded-3xl bg-white shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.photos[photo] ? <img src={img(p.photos[photo]!)} alt={p.name} className="h-full w-full object-cover" /> : <Package className="h-14 w-14 text-slate-300" />}
        </div>
        {p.photos.length > 1 && <div className="mt-2 flex gap-2">{p.photos.map((id, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <button key={id} onClick={() => setPhoto(i)} className={`h-16 w-16 overflow-hidden rounded-xl border-2 ${i === photo ? "border-[var(--brand)]" : "border-transparent"}`} aria-label={`Photo ${i + 1}`}><img src={img(id)} alt="" className="h-full w-full object-cover" /></button>
        ))}</div>}
      </div>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">{p.name}</h2>
          <p className="mt-1 text-2xl font-bold text-[var(--brand)]">{fcfa(price)} <span className="text-sm font-normal text-slate-500">/ {p.unit}</span></p>
          {!ok && <p className="mt-1 font-medium text-red-600">Épuisé pour le moment</p>}
          {ok && p.few !== null && <p className="mt-1 text-sm text-amber-700">Plus que {p.few} disponible(s)</p>}
        </div>
        {p.description && <p className="whitespace-pre-line text-slate-700">{p.description}</p>}
        {p.variants.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">{p.attrs.join(" / ") || "Choix"}</p>
            <div className="flex flex-wrap gap-2">
              {p.variants.map((x) => <button key={x.id} disabled={!x.available} onClick={() => setVid(x.id)} className={`rounded-xl border px-3 py-2 text-sm disabled:opacity-40 ${vid === x.id ? "border-[var(--brand)] bg-[var(--brand)]/10 font-medium" : "border-slate-300 bg-white"}`}>{x.label}{!x.available ? " (épuisé)" : ""}</button>)}
            </div>
          </div>
        )}
        {ordering ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-xl border border-slate-300 bg-white">
              <button className="grid h-11 w-11 place-items-center" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Moins"><Minus className="h-4 w-4" /></button>
              <span className="w-8 text-center font-semibold">{qty}</span>
              <button className="grid h-11 w-11 place-items-center" onClick={() => setQty(Math.min(99, qty + 1))} aria-label="Plus"><Plus className="h-4 w-4" /></button>
            </div>
            <button className="btn btn-primary flex-1 !py-3" disabled={!ok || need} onClick={() => onAdd(v, qty)}>{need ? "Choisissez une option" : "Ajouter au panier"}</button>
          </div>
        ) : null}
        {cat.shop.whatsapp && <a className="btn btn-ghost w-full" href={waLink(cat.shop.whatsapp, `Bonjour, je suis intéressé par « ${p.name} »${v ? ` (${v.label})` : ""} à ${fcfa(price)}.`)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> Demander sur WhatsApp</a>}
      </div>
    </article>
  );
}

function CartView({ cart, setCart, total, onCheckout, onBack }: { cart: Line[]; setCart: (f: (x: Line[]) => Line[]) => void; total: number; onCheckout: () => void; onBack: () => void }) {
  if (!cart.length) return <div className="py-16 text-center"><ShoppingBag className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-slate-600">Votre panier est vide.</p><button className="btn btn-primary mt-4" onClick={onBack}>Voir les produits</button></div>;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <ul className="divide-y divide-slate-100 rounded-2xl bg-white p-2 shadow-sm">
        {cart.map((l) => (
          <li key={l.key} className="flex items-center gap-3 p-2">
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{l.name}</span><span className="text-sm text-slate-500">{fcfa(l.price)}</span></span>
            <div className="flex items-center rounded-xl border border-slate-300">
              <button className="grid h-9 w-9 place-items-center" onClick={() => setCart((x) => (l.qty <= 1 ? x.filter((y) => y.key !== l.key) : x.map((y) => (y.key === l.key ? { ...y, qty: y.qty - 1 } : y))))} aria-label="Moins"><Minus className="h-4 w-4" /></button>
              <span className="w-7 text-center text-sm font-semibold">{l.qty}</span>
              <button className="grid h-9 w-9 place-items-center" onClick={() => setCart((x) => x.map((y) => (y.key === l.key ? { ...y, qty: Math.min(99, y.qty + 1) } : y)))} aria-label="Plus"><Plus className="h-4 w-4" /></button>
            </div>
            <span className="w-24 text-right text-sm font-semibold">{fcfa(l.price * l.qty)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 text-lg font-bold shadow-sm"><span>Sous-total</span><span>{fcfa(total)}</span></div>
      <button className="btn btn-primary w-full !py-3 text-base" onClick={onCheckout}>Commander</button>
    </div>
  );
}

function Checkout({ slug, cat, cart, total, test, onDone, onStale }: { slug: string; cat: Catalog; cart: Line[]; total: number; test: boolean; onDone: (d: { number: string; tracking: string; pay_url: string | null; pay_error: string | null }) => void; onStale: () => void }) {
  const [f, setF] = useState({ name: "", phone: "", address: "", note: "" });
  const [mode, setMode] = useState<"livraison" | "retrait">(cat.pickup ? "retrait" : "livraison");
  const [pay, setPay] = useState<"livraison" | "zingopay" | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [orderId] = useState(() => crypto.randomUUID());
  const fee = mode === "livraison" ? (cat.delivery?.fee ?? 0) : 0;
  // Exactement deux moyens de paiement : à la livraison (ou à la remise en boutique) et ZingoPay.
  const options = [
    ...(cat.payments.delivery ? [["livraison", mode === "livraison" ? "Payer à la livraison" : "Payer au retrait en boutique", "Vous ne payez rien maintenant : vous réglez à la réception de votre commande."] as const] : []),
    ...(cat.payments.zingopay ? [["zingopay", `Payer maintenant avec ZingoPay${cat.payments.zingopayTest ? " (test)" : ""}`, "Paiement en ligne sécurisé, confirmé automatiquement par ZingoPay."] as const] : []),
  ];
  useEffect(() => {
    if (!options.some(([k]) => k === pay)) setPay((options[0]?.[0] as typeof pay) ?? "");
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/public/shop/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demo: test, order: { id: orderId, items: cart.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, qty: l.qty })), customer: { name: f.name, phone: f.phone, address: f.address }, mode, pay_mode: pay, note: f.note } }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 409) onStale();
        throw new Error(b.error ?? "Commande impossible. Réessayez.");
      }
      onDone({ number: b.number, tracking: b.tracking, pay_url: b.pay_url ?? null, pay_error: b.pay_error ?? null });
    } catch (e) {
      setErr(e instanceof TypeError ? "Connexion impossible. Vérifiez Internet puis réessayez : votre commande ne sera pas enregistrée deux fois." : e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };
  const ready = f.name.trim() && f.phone.trim().length >= 6 && (mode === "retrait" || f.address.trim()) && pay;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Vos coordonnées</h2>
        <div className="space-y-3">
          <label className="block"><span className="label">Votre nom</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} autoComplete="name" /></label>
          <label className="block"><span className="label">Votre téléphone</span><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} autoComplete="tel" /></label>
        </div>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Réception</h2>
        <div className="grid grid-cols-2 gap-2">
          {cat.pickup && <button onClick={() => setMode("retrait")} className={`rounded-xl border p-3 text-left text-sm ${mode === "retrait" ? "border-[var(--brand)] bg-[var(--brand)]/5 font-medium" : "border-slate-300"}`}><Store className="mb-1 h-4 w-4" /> Retrait en boutique<span className="block text-xs font-normal text-slate-500">Gratuit</span></button>}
          {cat.delivery && <button onClick={() => setMode("livraison")} className={`rounded-xl border p-3 text-left text-sm ${mode === "livraison" ? "border-[var(--brand)] bg-[var(--brand)]/5 font-medium" : "border-slate-300"}`}><Truck className="mb-1 h-4 w-4" /> Livraison<span className="block text-xs font-normal text-slate-500">{cat.delivery.fee ? fcfa(cat.delivery.fee) : "Gratuite"}</span></button>}
        </div>
        {mode === "livraison" && <label className="mt-3 block"><span className="label">Adresse de livraison</span><textarea className="input" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={300} placeholder="Quartier, repère…" /></label>}
        {mode === "livraison" && cat.delivery?.info && <p className="mt-2 text-xs text-slate-500">{cat.delivery.info}</p>}
        {mode === "retrait" && (cat.pickup?.info || cat.shop.address) && <p className="mt-2 text-xs text-slate-500">{cat.pickup?.info || cat.shop.address}</p>}
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Paiement</h2>
        {options.length === 0 ? <p className="text-sm text-red-600">Cette boutique n&apos;a pas encore activé de moyen de paiement. Contactez-la par WhatsApp.</p> : (
          <div className="space-y-2">{options.map(([k, l, d]) => <label key={k} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${pay === k ? "border-[var(--brand)] bg-[var(--brand)]/5" : "border-slate-300"}`}><input type="radio" name="pay" className="mt-1" checked={pay === k} onChange={() => setPay(k)} /><span><span className="font-medium">{l}</span><span className="block text-xs text-slate-500">{d}</span></span></label>)}</div>
        )}
        <label className="mt-3 block"><span className="label">Message pour le commerçant (facultatif)</span><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} /></label>
      </section>
      <section className="space-y-1 rounded-2xl bg-white p-4 text-sm shadow-sm">
        <div className="flex justify-between"><span>Articles</span><span>{fcfa(total)}</span></div>
        {mode === "livraison" && <div className="flex justify-between"><span>Livraison</span><span>{fee ? fcfa(fee) : "Gratuite"}</span></div>}
        <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{fcfa(total + fee)}</span></div>
      </section>
      {err && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <button className="btn btn-primary w-full !py-3 text-base" disabled={!ready || busy} onClick={submit}>{busy ? "Envoi…" : pay === "zingopay" ? "Commander et payer" : "Envoyer ma commande"}</button>
    </div>
  );
}

function Done({ d, slug, q1, name, whatsapp, onBack }: { d: { number: string; tracking: string; pay_url: string | null; pay_error: string | null }; slug: string; q1: string; name: string; whatsapp: string; onBack: () => void }) {
  const track = `/shop/${slug}/suivi?t=${d.tracking}${q1 ? "&test=1" : ""}`;
  return (
    <div className="mx-auto max-w-md space-y-4 py-6 text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-8 w-8" /></span>
      <h2 className="text-xl font-bold">Commande envoyée !</h2>
      <p className="text-slate-600">Numéro <b>{d.number}</b>. Statut : <b>en attente de confirmation</b> : {name} a été prévenu et va la confirmer.</p>
      {d.pay_url && <a className="btn btn-primary w-full !py-3" href={d.pay_url}>Payer maintenant avec ZingoPay</a>}
      {d.pay_error && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Paiement non confirmé : {d.pay_error} Votre commande est conservée : réessayez le paiement depuis la page de suivi.</p>}
      <Link className="btn btn-ghost w-full" href={track}>Suivre ma commande</Link>
      <p className="text-xs text-slate-500">Gardez ce lien : il vous permet de suivre votre commande sans compte. Il est aussi retrouvable avec le numéro et votre téléphone.</p>
      {whatsapp && <a className="btn btn-ghost w-full" href={waLink(whatsapp, `Bonjour, j'ai passé la commande ${d.number}.`)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> Écrire au commerçant</a>}
      <button className="text-sm text-slate-500 underline" onClick={onBack}>Retour à la boutique</button>
    </div>
  );
}
