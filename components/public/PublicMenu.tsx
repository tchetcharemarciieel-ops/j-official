"use client";

import { ChevronLeft, FlaskConical, Minus, Plus, QrCode, ShoppingBag, Utensils, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; name: string; category: string; price: number; description: string; photo: string | null; options: { id: string; name: string; price: number }[]; available: boolean };
type Menu = {
  restaurant: { name: string; slug: string; primary: string; logo: string | null; welcome: string };
  published: boolean;
  ordering: boolean;
  payments: { counter: boolean; aletchcard: boolean; demo: boolean };
  kitchenAfterPayment: boolean;
  demo: boolean;
  table: { number: string } | null;
  qr: "ok" | "desactive" | "inconnu";
  items: Item[];
};
type Line = { key: string; menu_id: string; qty: number; options: string[]; note: string };

const CATS: Record<string, string> = { entree: "Entrées", plat: "Plats", dessert: "Desserts", boisson: "Boissons", accompagnement: "Accompagnements", autre: "Autres" };
const ORDER = ["entree", "plat", "accompagnement", "dessert", "boisson", "autre"];
const money = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;

/** Clé de la session de menu : un QR code scanné = une session (fermée par « OK, c'est bon »). */
export const sessionKey = (slug: string, token: string | null) => `msr:session:${slug}:${token ?? "menu"}`;

function visitorId() {
  try {
    let v = localStorage.getItem("msr:visitor");
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem("msr:visitor", v);
    }
    return v;
  } catch {
    return undefined;
  }
}

/**
 * Menu public ouvert par un QR code : plats, options, panier et commande, sans application ni
 * compte. La table vient du QR code (jeton secret) et ne peut pas être changée par le client.
 */
export function PublicMenu({ slug, tableToken, menuToken, demo }: { slug: string; tableToken: string | null; menuToken: string | null; demo: boolean }) {
  const router = useRouter();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);
  const [cat, setCat] = useState<string>("");
  const [open, setOpen] = useState<Item | null>(null);
  const [cart, setCart] = useState<Line[]>([]);
  const [showCart, setShowCart] = useState(false);
  const skey = sessionKey(slug, tableToken ?? menuToken);
  const views = useRef<Set<string>>(new Set());
  const qs = `${tableToken ? `t=${encodeURIComponent(tableToken)}&` : ""}${menuToken ? `q=${encodeURIComponent(menuToken)}&` : ""}${demo ? "demo=1" : ""}`;

  useEffect(() => {
    try {
      if (sessionStorage.getItem(`${skey}:closed`)) return setClosed(true);
      const saved = sessionStorage.getItem(`${skey}:cart`);
      if (saved) setCart(JSON.parse(saved) as Line[]);
    } catch {
      /* stockage indisponible */
    }
    fetch(`/api/public/r/${slug}?${qs}`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? "Menu indisponible.");
        setMenu(b as Menu);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Menu indisponible."));
  }, [slug, qs, skey]);

  // Statistiques anonymes : un scan par session, et les plats consultés.
  const stat = useCallback((s: { scan?: string; views?: string[] }) => {
    void fetch(`/api/public/r/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "stat", demo, stat: { ...s, visitor: visitorId() } }), keepalive: true }).catch(() => undefined);
  }, [slug, demo]);
  useEffect(() => {
    if (!menu || menu.qr !== "ok") return;
    try {
      if (sessionStorage.getItem(`${skey}:scan`)) return;
      sessionStorage.setItem(`${skey}:scan`, "1");
    } catch {
      /* rien */
    }
    stat({ scan: tableToken ? `table:${tableToken.slice(0, 10)}` : menuToken ? "menu" : "direct" });
  }, [menu, skey, stat, tableToken, menuToken]);
  useEffect(() => {
    const flush = () => {
      if (views.current.size) stat({ views: [...views.current] });
      views.current.clear();
    };
    const t = setInterval(flush, 20_000);
    window.addEventListener("pagehide", flush);
    return () => (clearInterval(t), window.removeEventListener("pagehide", flush));
  }, [stat]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`${skey}:cart`, JSON.stringify(cart));
    } catch {
      /* rien */
    }
  }, [cart, skey]);

  const cats = useMemo(() => (menu ? ORDER.filter((c) => menu.items.some((i) => i.category === c)) : []), [menu]);
  useEffect(() => {
    if (!cat && cats[0]) setCat(cats[0]);
  }, [cats, cat]);
  const byId = (id: string) => menu?.items.find((i) => i.id === id);
  const unit = (l: Line) => {
    const it = byId(l.menu_id);
    return it ? it.price + it.options.filter((o) => l.options.includes(o.id)).reduce((a, o) => a + o.price, 0) : 0;
  };
  const total = cart.reduce((a, l) => a + unit(l) * l.qty, 0);
  const count = cart.reduce((a, l) => a + l.qty, 0);

  const primary = menu?.restaurant.primary ?? "#2563eb";
  if (closed)
    return (
      <Screen primary={primary}>
        <QrCode className="mx-auto h-12 w-12 text-slate-400" aria-hidden />
        <h1 className="mt-3 text-xl font-bold">Session du menu terminée</h1>
        <p className="mt-2 text-sm text-slate-600">Pour commander à nouveau, scannez une nouvelle fois le QR code de votre table.</p>
        <p className="mt-2 text-xs text-slate-500">Votre commande et son suivi ne sont pas concernés : utilisez votre lien de suivi.</p>
      </Screen>
    );
  if (error) return <Screen primary={primary}><h1 className="text-lg font-bold">Menu indisponible</h1><p className="mt-2 text-sm text-slate-600">{error}</p></Screen>;
  if (!menu) return <Screen primary={primary}><span className="spinner !border-slate-300 !border-t-slate-600" aria-hidden /><p className="mt-3 text-sm text-slate-500">Chargement du menu…</p></Screen>;
  if (menu.qr === "desactive" || menu.qr === "inconnu")
    return (
      <Screen primary={primary}>
        <QrCode className="mx-auto h-12 w-12 text-slate-400" aria-hidden />
        <h1 className="mt-3 text-xl font-bold">{menu.qr === "desactive" ? "Ce QR code est désactivé" : "QR code non reconnu"}</h1>
        <p className="mt-2 text-sm text-slate-600">{menu.qr === "desactive" ? `Le restaurant ${menu.restaurant.name} a désactivé ce QR code. Demandez au serveur un nouveau QR code ou le menu papier.` : "Ce QR code ne correspond à aucune table active. Demandez de l'aide au serveur."}</p>
      </Screen>
    );
  if (!menu.published && !menu.demo) return <Screen primary={primary}><h1 className="text-lg font-bold">{menu.restaurant.name}</h1><p className="mt-2 text-sm text-slate-600">Le menu en ligne n&apos;est pas encore publié. Demandez le menu au serveur.</p></Screen>;

  const add = (l: Omit<Line, "key">) => setCart((c) => [...c, { ...l, key: crypto.randomUUID() }]);
  return (
    <div className="min-h-dvh bg-slate-50 pb-28" style={{ "--app-primary": primary } as React.CSSProperties}>
      {menu.demo && <p className="sticky top-0 z-30 flex items-center justify-center gap-1.5 bg-amber-100 px-3 py-1.5 text-center text-xs font-semibold text-amber-900"><FlaskConical className="h-3.5 w-3.5" aria-hidden />Mode test : commandes de démonstration, aucun paiement réel</p>}
      <header className="bg-white px-4 pb-3 pt-5 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          {menu.restaurant.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={menu.restaurant.logo} alt="" className="h-12 w-12 rounded-xl object-cover" />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-xl text-white" style={{ background: primary }}><Utensils className="h-6 w-6" aria-hidden /></span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{menu.restaurant.name}</h1>
            <p className="text-xs text-slate-500">{menu.table ? `Table ${menu.table.number}` : "Menu"}{menu.ordering ? " · commande depuis votre téléphone" : " · consultation"}</p>
          </div>
          {menu.table && <span className="rounded-full px-3 py-1 text-sm font-bold text-white" style={{ background: primary }}>Table {menu.table.number}</span>}
        </div>
        {menu.restaurant.welcome && <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">{menu.restaurant.welcome}</p>}
      </header>
      <nav className="sticky top-0 z-20 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur" aria-label="Catégories">
        <div className="mx-auto flex max-w-2xl gap-1.5">
          {cats.map((c) => (
            <a key={c} href={`#cat-${c}`} onClick={() => setCat(c)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${cat === c ? "font-semibold text-white" : "bg-slate-100 text-slate-700"}`} style={cat === c ? { background: primary } : undefined}>{CATS[c]}</a>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-2xl space-y-6 px-3 pt-4">
        {menu.items.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500">La carte est vide pour le moment.</p>}
        {cats.map((c) => (
          <section key={c} id={`cat-${c}`} className="scroll-mt-16">
            <h2 className="mb-2 text-base font-bold">{CATS[c]}</h2>
            <ul className="space-y-2">
              {menu.items.filter((i) => i.category === c).map((i) => (
                <li key={i.id}>
                  <button type="button" disabled={!i.available} onClick={() => (views.current.add(i.id), setOpen(i))} className="flex w-full items-stretch gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition active:scale-[.99] disabled:opacity-60">
                    {i.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.photo} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" loading="lazy" />
                    ) : (
                      <span className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400"><Utensils className="h-6 w-6" aria-hidden /></span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900">{i.name}</span>
                      {i.description && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{i.description}</span>}
                      <span className="mt-1 block text-sm font-bold" style={{ color: primary }}>{money(i.price)}</span>
                      {!i.available && <span className="mt-0.5 block text-xs font-semibold text-red-600">Épuisé</span>}
                    </span>
                    {i.available && menu.ordering && <span className="grid h-9 w-9 shrink-0 place-items-center self-center rounded-full text-white" style={{ background: primary }} aria-hidden><Plus className="h-5 w-5" /></span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="pb-4 text-center text-[11px] text-slate-400">Menu en ligne MiniSoft RCA · aucune application à installer</p>
      </main>

      {menu.ordering && count > 0 && !showCart && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3">
          <button type="button" onClick={() => setShowCart(true)} className="mx-auto flex w-full max-w-2xl items-center gap-3 rounded-2xl px-4 py-3.5 text-white shadow-xl" style={{ background: primary }}>
            <span className="grid h-8 min-w-8 place-items-center rounded-full bg-white/25 px-2 text-sm font-bold">{count}</span>
            <span className="flex-1 text-left font-semibold">Voir le panier</span>
            <span className="font-bold">{money(total)}</span>
          </button>
        </div>
      )}
      {open && <ItemSheet item={open} primary={primary} ordering={menu.ordering} onClose={() => setOpen(null)} onAdd={(l) => (add(l), setOpen(null))} />}
      {showCart && (
        <CartSheet
          menu={menu}
          cart={cart}
          unit={unit}
          total={total}
          primary={primary}
          onChange={setCart}
          onClose={() => setShowCart(false)}
          onOrder={async (extra) => {
            const r = await fetch(`/api/public/r/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "order", demo: menu.demo, order: { table_token: tableToken, lines: cart.map((l) => ({ menu_id: l.menu_id, qty: l.qty, options: l.options, note: l.note })), ...extra } }) });
            const b = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(b.error ?? b.details?.[0] ?? "Commande impossible. Réessayez ou appelez le serveur.");
            try {
              const list = JSON.parse(localStorage.getItem(`msr:orders:${slug}`) ?? "[]") as { t: string; at: string }[];
              localStorage.setItem(`msr:orders:${slug}`, JSON.stringify([{ t: b.tracking, at: new Date().toISOString() }, ...list].slice(0, 10)));
            } catch {
              /* rien */
            }
            router.push(`/r/${slug}/suivi/${b.tracking}?nouveau=1&s=${encodeURIComponent(skey)}${menu.demo ? "&demo=1" : ""}`);
          }}
        />
      )}
    </div>
  );
}

function Screen({ children, primary }: { children: React.ReactNode; primary: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6" style={{ "--app-primary": primary } as React.CSSProperties}>
      <div className="max-w-sm rounded-3xl bg-white p-6 text-center shadow-sm">{children}</div>
    </div>
  );
}

function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-label={title} className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" style={{ animation: "fade-up .2s ease both" }}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-slate-100 p-3">{footer}</div>}
      </div>
    </div>
  );
}

function ItemSheet({ item, primary, ordering, onClose, onAdd }: { item: Item; primary: string; ordering: boolean; onClose: () => void; onAdd: (l: Omit<Line, "key">) => void }) {
  const [qty, setQty] = useState(1);
  const [opts, setOpts] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const price = item.price + item.options.filter((o) => opts.includes(o.id)).reduce((a, o) => a + o.price, 0);
  return (
    <Sheet
      title={item.name}
      onClose={onClose}
      footer={
        ordering ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-full border border-slate-300">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-11 w-11 place-items-center" aria-label="Moins"><Minus className="h-4 w-4" aria-hidden /></button>
              <span className="w-6 text-center font-bold" aria-live="polite">{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(50, q + 1))} className="grid h-11 w-11 place-items-center" aria-label="Plus"><Plus className="h-4 w-4" aria-hidden /></button>
            </div>
            <button type="button" onClick={() => onAdd({ menu_id: item.id, qty, options: opts, note: note.trim() })} className="flex-1 rounded-full py-3 font-semibold text-white" style={{ background: primary }}>Ajouter · {money(price * qty)}</button>
          </div>
        ) : undefined
      }
    >
      {item.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo} alt="" className="mb-3 aspect-video w-full rounded-2xl object-cover" />
      )}
      {item.description && <p className="text-sm text-slate-600">{item.description}</p>}
      <p className="mt-2 text-lg font-bold" style={{ color: primary }}>{money(item.price)}</p>
      {ordering && item.options.length > 0 && (
        <fieldset className="mt-4">
          <legend className="mb-1.5 text-sm font-semibold">Options</legend>
          <ul className="space-y-1.5">
            {item.options.map((o) => (
              <li key={o.id}>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                  <input type="checkbox" checked={opts.includes(o.id)} onChange={(e) => setOpts((x) => (e.target.checked ? [...x, o.id] : x.filter((y) => y !== o.id)))} className="h-5 w-5" />
                  <span className="flex-1 text-sm">{o.name}</span>
                  <span className="text-sm text-slate-600">{o.price ? `+ ${money(o.price)}` : "gratuit"}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {ordering && (
        <label className="mt-4 block text-sm font-semibold">
          Instructions pour ce plat (facultatif)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ex. : sans piment, bien cuit…" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal" />
        </label>
      )}
    </Sheet>
  );
}

function CartSheet({ menu, cart, unit, total, primary, onChange, onClose, onOrder }: { menu: Menu; cart: Line[]; unit: (l: Line) => number; total: number; primary: string; onChange: (c: Line[]) => void; onClose: () => void; onOrder: (extra: { note: string; customer: string; pay: "caisse" | "demo"; idem: string }) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [customer, setCustomer] = useState("");
  const [pay, setPay] = useState<"caisse" | "demo">(menu.payments.counter ? "caisse" : "demo");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const idem = useRef(crypto.randomUUID());
  const item = (id: string) => menu.items.find((i) => i.id === id);
  const setQty = (key: string, q: number) => onChange(q <= 0 ? cart.filter((l) => l.key !== key) : cart.map((l) => (l.key === key ? { ...l, qty: Math.min(50, q) } : l)));
  return (
    <Sheet
      title="Votre panier"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {err && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <button
            type="button"
            disabled={busy || cart.length === 0}
            onClick={async () => {
              setBusy(true);
              setErr("");
              try {
                await onOrder({ note, customer, pay, idem: idem.current });
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Commande impossible.");
                setBusy(false);
              }
            }}
            className="w-full rounded-full py-3.5 font-bold text-white disabled:opacity-60"
            style={{ background: primary }}
          >
            {busy ? "Envoi…" : `Confirmer la commande · ${money(total)}`}
          </button>
          <button type="button" onClick={onClose} className="flex w-full items-center justify-center gap-1 py-1 text-sm text-slate-600"><ChevronLeft className="h-4 w-4" aria-hidden />Continuer mes choix</button>
        </div>
      }
    >
      {cart.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500"><ShoppingBag className="mx-auto mb-2 h-8 w-8" aria-hidden />Votre panier est vide.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {cart.map((l) => {
            const it = item(l.menu_id);
            const opts = it?.options.filter((o) => l.options.includes(o.id)) ?? [];
            return (
              <li key={l.key} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{it?.name ?? "Plat retiré"}</p>
                  {opts.length > 0 && <p className="text-xs text-slate-500">{opts.map((o) => o.name).join(", ")}</p>}
                  {l.note && <p className="text-xs text-amber-700">« {l.note} »</p>}
                  <p className="mt-0.5 text-sm text-slate-600">{money(unit(l))}</p>
                </div>
                <div className="flex items-center rounded-full border border-slate-300">
                  <button type="button" onClick={() => setQty(l.key, l.qty - 1)} className="grid h-9 w-9 place-items-center" aria-label={`Retirer un ${it?.name ?? "plat"}`}><Minus className="h-4 w-4" aria-hidden /></button>
                  <span className="w-5 text-center text-sm font-bold">{l.qty}</span>
                  <button type="button" onClick={() => setQty(l.key, l.qty + 1)} className="grid h-9 w-9 place-items-center" aria-label={`Ajouter un ${it?.name ?? "plat"}`}><Plus className="h-4 w-4" aria-hidden /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-lg font-bold"><span>Total</span><span>{money(total)}</span></div>
      <label className="mt-4 block text-sm font-semibold">Instructions pour la commande (facultatif)<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal" placeholder="Ex. : apporter les boissons d'abord" /></label>
      <label className="mt-3 block text-sm font-semibold">Votre prénom (facultatif)<input value={customer} onChange={(e) => setCustomer(e.target.value)} maxLength={60} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal" /></label>
      <fieldset className="mt-4">
        <legend className="mb-1.5 text-sm font-semibold">Paiement</legend>
        <div className="space-y-1.5">
          {menu.payments.counter && <PayChoice checked={pay === "caisse"} onChange={() => setPay("caisse")} title="Payer à la caisse ou au serveur" text="Espèces ou mobile money. Le paiement est confirmé par l'équipe." />}
          <PayChoice checked={false} disabled title="ALETCHCARD" text="Bientôt disponible : le paiement en ligne n'est pas encore activé." />
          {menu.payments.demo && <PayChoice checked={pay === "demo"} onChange={() => setPay("demo")} title="Paiement de démonstration" text="Mode test uniquement : aucun argent réel." />}
        </div>
        {menu.kitchenAfterPayment && <p className="mt-2 text-xs text-slate-500">Votre commande part en cuisine dès que le paiement est confirmé.</p>}
      </fieldset>
    </Sheet>
  );
}

function PayChoice({ checked, onChange, title, text, disabled }: { checked: boolean; onChange?: () => void; title: string; text: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${checked ? "border-[var(--app-primary)] ring-2 ring-[var(--app-primary)]/20" : "border-slate-200"} ${disabled ? "opacity-50" : ""}`}>
      <input type="radio" name="pay" checked={checked} onChange={onChange} disabled={disabled} className="mt-0.5 h-5 w-5" />
      <span><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-slate-500">{text}</span></span>
    </label>
  );
}
