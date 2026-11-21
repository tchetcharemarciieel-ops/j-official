"use client";

import { Banknote, Camera, CreditCard, LockKeyhole, Minus, Package, Plus, Printer, Share2, ShoppingCart, Smartphone, Trash2, UserRound, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { availableOf, expectedCash, findVariant, hasVariants, normPhone, priceOf, saleTotals, variantLabel, type Category, type Customer, type Doc, type Product, type Register, type Sale } from "@/lib/shop/model";
import { useCtx } from "../context";
import { invoiceHtml, printHtml, receiptHtml, receiptText } from "../print";
import { Badge, Card, Empty, Field, Modal, SearchBox, fcfa, qtyFmt } from "../ui";

type Line = { key: string; product_id: string; variant_id: string | null; name: string; price: number; qty: number; discount: number; max: number; unit: string };
type Method = "especes" | "mobile_money" | "carte";

/** Caisse : recherche, lecteur de code-barres, panier, remises, paiements et reçu. */
export function Pos() {
  const c = useCtx();
  const me = c.s.me;
  const registers = c.data.register as Doc<Register>[];
  const mine = registers.find((r) => r.data.status === "ouverte" && r.data.opened_by === me) ?? null;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [pick, setPick] = useState<Doc<Product> | null>(null);
  const [pay, setPay] = useState(false);
  const [done, setDone] = useState<{ sale: Sale; change: number; id: string } | null>(null);
  const [scan, setScan] = useState(false);
  const [regModal, setRegModal] = useState<"open" | "move" | "close" | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const cats = c.data.category as Doc<Category>[];

  const sellable = useMemo(() => c.products.filter((p) => p.data.active), [c.products]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return sellable.filter((p) => (!cat || p.data.category_id === cat) && (!n || [p.data.name, p.data.sku, p.data.barcode, ...p.data.variants.flatMap((v) => [v.sku, v.barcode])].some((x) => x?.toLowerCase().includes(n)))).slice(0, 60);
  }, [sellable, q, cat]);

  const add = (p: Doc<Product>, variantId: string | null) => {
    const v = findVariant(p.data, variantId);
    const key = `${p.id}:${v?.id ?? ""}`;
    const max = availableOf(p.data, v?.id ?? null);
    setCart((x) => {
      const cur = x.find((l) => l.key === key);
      if ((cur?.qty ?? 0) + 1 > max) {
        c.notify("error", `Plus de stock disponible pour « ${p.data.name}${v ? ` — ${variantLabel(v)}` : ""} » (${qtyFmt(Math.max(0, max))}).`);
        return x;
      }
      if (cur) return x.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [...x, { key, product_id: p.id, variant_id: v?.id ?? null, name: v ? `${p.data.name} — ${variantLabel(v)}` : p.data.name, price: priceOf(p.data, v?.id ?? null), qty: 1, discount: 0, max, unit: p.data.unit }];
    });
  };
  const choose = (p: Doc<Product>) => (hasVariants(p.data) ? setPick(p) : add(p, null));

  /** Code exact (lecteur de code-barres = clavier qui tape le code puis Entrée). */
  const byCode = (code: string) => {
    const k = code.trim();
    if (!k) return false;
    for (const p of sellable) {
      if (p.data.barcode === k || p.data.sku === k) return (choose(p), true);
      const v = p.data.variants.find((x) => x.active && (x.barcode === k || x.sku === k));
      if (v) return (add(p, v.id), true);
    }
    return false;
  };

  const totals = saleTotals(cart.map((l) => ({ qty: l.qty, unit_price: l.price, discount: l.discount })), Number(discount) || 0);

  if (!mine)
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Card title="Caisse fermée" subtitle="Ouvrez votre caisse pour encaisser. Le fond de caisse est l'argent déjà dans le tiroir.">
          <button className="btn btn-primary w-full" onClick={() => setRegModal("open")}><LockKeyhole className="h-4 w-4" /> Ouvrir la caisse</button>
          {registers.filter((r) => r.data.status === "ouverte").length > 0 && <p className="mt-3 text-xs text-slate-500">Autre(s) caisse(s) ouverte(s) : {registers.filter((r) => r.data.status === "ouverte").map((r) => c.memberName(r.data.opened_by)).join(", ")}.</p>}
        </Card>
        {regModal === "open" && <OpenRegister onClose={() => setRegModal(null)} />}
      </div>
    );

  const expected = expectedCash(mine, c.data.sale as Doc<Sale>[]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
          <Wallet className="h-4 w-4 text-emerald-600" aria-hidden />
          <span className="flex-1">Caisse ouverte · espèces attendues : <b>{fcfa(expected)}</b></span>
          <button className="btn btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setRegModal("move")}>Entrée / sortie</button>
          <button className="btn btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setRegModal("close")}>Fermer la caisse</button>
        </div>
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          if (byCode(q)) setQ("");
          else if (shown.length === 1) (choose(shown[0]!), setQ(""));
        }}>
          <div className="flex-1"><SearchBox value={q} onChange={setQ} placeholder="Produit, référence ou code-barres (lecteur)…" autoFocus /></div>
          {typeof window !== "undefined" && "BarcodeDetector" in window && <button type="button" className="btn btn-ghost" onClick={() => setScan(true)} aria-label="Scanner avec la caméra"><Camera className="h-4 w-4" /></button>}
        </form>
        {cats.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setCat("")} className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${!cat ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-slate-300 bg-white"}`}>Tout</button>
            {cats.map((k) => <button key={k.id} onClick={() => setCat(k.id)} className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${cat === k.id ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-slate-300 bg-white"}`}>{k.data.name}</button>)}
          </div>
        )}
        {shown.length === 0 ? (
          <Empty icon={Package} title={sellable.length ? "Aucun produit trouvé" : "Aucun produit à vendre"} text={sellable.length ? undefined : "Ajoutez des produits dans « Produits »."} />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => {
              const photo = c.img(p.data.photo_ids[0]);
              const free = hasVariants(p.data) ? p.data.variants.filter((v) => v.active).reduce((a, v) => a + Math.max(0, availableOf(p.data, v.id)), 0) : availableOf(p.data, null);
              return (
                <button key={p.id} onClick={() => choose(p)} disabled={free <= 0} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-[var(--brand)] disabled:opacity-50">
                  <span className="grid aspect-[4/3] place-items-center bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {photo ? <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Package className="h-7 w-7 text-slate-400" />}
                  </span>
                  <span className="p-2">
                    <span className="line-clamp-2 text-sm font-medium leading-tight">{p.data.name}</span>
                    <span className="mt-1 flex items-center justify-between gap-1 text-xs">
                      <b className="text-sm">{fcfa(p.data.sell_price)}</b>
                      <span className={free <= 0 ? "text-red-600" : "text-slate-500"}>{free <= 0 ? "Épuisé" : qtyFmt(free)}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card title={<span className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Panier</span>} action={cart.length > 0 && <button className="text-xs text-slate-500 hover:text-red-600" onClick={() => (setCart([]), setDiscount(""))}>Vider</button>}>
          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Touchez un produit ou scannez son code-barres.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cart.map((l) => (
                <li key={l.key} className="py-2">
                  <div className="flex items-start gap-2">
                    <span className="flex-1 text-sm font-medium leading-tight">{l.name}</span>
                    <button className="text-slate-400 hover:text-red-600" onClick={() => setCart((x) => x.filter((y) => y.key !== l.key))} aria-label="Retirer"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <button className="grid h-8 w-8 place-items-center rounded-lg border" onClick={() => setCart((x) => x.map((y) => (y.key === l.key ? { ...y, qty: Math.max(1, y.qty - 1) } : y)))} aria-label="Moins"><Minus className="h-4 w-4" /></button>
                    <input className="input !w-16 !py-1 text-center" inputMode="decimal" value={l.qty} onChange={(e) => {
                      const v = Number(e.target.value.replace(",", ".")) || 0;
                      setCart((x) => x.map((y) => (y.key === l.key ? { ...y, qty: Math.min(Math.max(0, v), y.max) } : y)));
                    }} aria-label="Quantité" />
                    <button className="grid h-8 w-8 place-items-center rounded-lg border" onClick={() => setCart((x) => x.map((y) => (y.key === l.key ? { ...y, qty: Math.min(y.max, y.qty + 1) } : y)))} aria-label="Plus"><Plus className="h-4 w-4" /></button>
                    <span className="ml-auto text-sm font-semibold">{fcfa(Math.max(0, l.qty * l.price - l.discount))}</span>
                  </div>
                  {c.s.can.remises && (
                    <label className="mt-1 flex items-center gap-2 text-xs text-slate-500">Remise
                      <input className="input !w-24 !py-0.5 text-xs" inputMode="numeric" value={l.discount || ""} onChange={(e) => setCart((x) => x.map((y) => (y.key === l.key ? { ...y, discount: Math.min(Number(e.target.value.replace(/\D/g, "")) || 0, y.qty * y.price) } : y)))} aria-label="Remise sur la ligne" /> FCFA
                    </label>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between"><span>Sous-total</span><span>{fcfa(totals.subtotal)}</span></div>
            {c.s.can.remises && (
              <div className="flex items-center justify-between gap-2"><span>Remise globale</span><input className="input !w-28 !py-1 text-right" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/\D/g, ""))} placeholder="0" aria-label="Remise globale" /></div>
            )}
            <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{fcfa(totals.total)}</span></div>
          </div>
          <button className="btn btn-primary mt-3 w-full !py-3 text-base" disabled={!cart.length || cart.some((l) => l.qty <= 0)} onClick={() => setPay(true)}>Encaisser {fcfa(totals.total)}</button>
        </Card>
      </aside>

      {pick && <VariantPicker product={pick} onPick={(vid) => (add(pick, vid), setPick(null))} onClose={() => setPick(null)} />}
      {pay && <PayModal total={totals.total} cart={cart} discount={Number(discount) || 0} register={mine} onClose={() => setPay(false)} onDone={(sale, change, id) => {
        setPay(false);
        setCart([]);
        setDiscount("");
        setDone({ sale, change, id });
        search.current?.focus();
      }} />}
      {done && <ReceiptModal sale={done.sale} change={done.change} saleId={done.id} onClose={() => setDone(null)} />}
      {scan && <CameraScan onCode={(code) => { if (!byCode(code)) c.notify("error", `Code « ${code} » inconnu.`); setScan(false); }} onClose={() => setScan(false)} />}
      {regModal === "move" && <MoveCash register={mine} onClose={() => setRegModal(null)} />}
      {regModal === "close" && <CloseRegister register={mine} expected={expected} onClose={() => setRegModal(null)} />}
    </div>
  );
}

function VariantPicker({ product, onPick, onClose }: { product: Doc<Product>; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <Modal title={product.data.name} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {product.data.variants.filter((v) => v.active).map((v) => {
          const free = availableOf(product.data, v.id);
          return (
            <button key={v.id} disabled={free <= 0} onClick={() => onPick(v.id)} className="rounded-xl border border-slate-200 p-3 text-left hover:border-[var(--brand)] disabled:opacity-40">
              <span className="block font-medium">{variantLabel(v)}</span>
              <span className="text-sm">{fcfa(v.price ?? product.data.sell_price)}</span>
              <span className={`block text-xs ${free <= 0 ? "text-red-600" : "text-slate-500"}`}>{free <= 0 ? "Épuisé" : `${qtyFmt(free)} en stock`}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function PayModal({ total, cart, discount, register, onClose, onDone }: { total: number; cart: Line[]; discount: number; register: Doc<Register>; onClose: () => void; onDone: (s: Sale, change: number, id: string) => void }) {
  const c = useCtx();
  const [method, setMethod] = useState<Method>("especes");
  const [given, setGiven] = useState("");
  const [ref, setRef] = useState("");
  const [partial, setPartial] = useState(false);
  const [amount, setAmount] = useState(String(total));
  const [cust, setCust] = useState({ id: "", name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const saleId = useRef(crypto.randomUUID());
  const customers = c.data.customer as Doc<Customer>[];
  const found = cust.phone.length >= 4 ? customers.find((x) => normPhone(x.data.phone).endsWith(normPhone(cust.phone))) : undefined;
  const paidNow = partial ? Math.min(total, Number(amount) || 0) : total;
  const change = method === "especes" && !partial ? Math.max(0, (Number(given) || 0) - total) : 0;
  const short = method === "especes" && !partial && given !== "" && Number(given) < total;
  const needCustomer = paidNow < total;

  const submit = async () => {
    setBusy(true);
    const input = {
      id: saleId.current,
      items: cart.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, qty: l.qty, discount: l.discount })),
      discount,
      payments: paidNow > 0 ? [{ method, amount: paidNow, ref }] : [],
      customer_id: cust.id || found?.id || null,
      customer: cust.id || found ? null : cust.name || cust.phone ? { name: cust.name, phone: cust.phone } : null,
      register_id: register.id,
    };
    const r = await c.run("sale.create", input, { offlineLabel: cart.map((l) => `${l.name} × ${l.qty}`).join(", "), offlineTotal: total });
    setBusy(false);
    if (!r) return;
    const sale: Sale = {
      number: r.number ?? "Hors connexion (provisoire)", at: new Date().toISOString(), channel: "caisse",
      items: cart.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, name: l.name, unit: l.unit, qty: l.qty, unit_price: l.price, buy_price: 0, discount: l.discount })),
      subtotal: total + discount, discount, total, payments: input.payments.map((p) => ({ ...p, id: "", at: "", by: "", register_id: null })), returns: [], status: "validee", customer_id: null,
      customer_name: found?.data.name ?? cust.name, register_id: register.id, by: c.s.me, order_id: null, note: "", invoice_number: null, offline_at: r.queued ? new Date().toISOString() : null, conflict: null,
    };
    onDone(sale, change, r.id ?? saleId.current);
  };

  const methods: [Method, string, typeof Banknote][] = [["especes", "Espèces", Banknote], ["mobile_money", "Mobile Money", Smartphone], ["carte", "Carte bancaire", CreditCard]];
  return (
    <Modal title={`Encaisser ${fcfa(total)}`} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Retour</button><button className="btn btn-primary" disabled={busy || short || (needCustomer && !(cust.id || found || cust.name))} onClick={submit}>Valider la vente</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {methods.map(([m, l, I]) => (
            <button key={m} onClick={() => setMethod(m)} className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-sm ${method === m ? "border-[var(--brand)] bg-[var(--brand)]/5 font-medium" : "border-slate-200"}`}>
              <I className="h-5 w-5" /> {l}
            </button>
          ))}
        </div>
        {method === "especes" && !partial && (
          <div>
            <Field label="Montant reçu du client"><input className="input text-lg" inputMode="numeric" value={given} onChange={(e) => setGiven(e.target.value.replace(/\D/g, ""))} placeholder={String(total)} autoFocus /></Field>
            <div className="mt-2 flex flex-wrap gap-2">
              {[...new Set([total, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000])].map((v) => <button key={v} className="rounded-full border px-3 py-1 text-sm" onClick={() => setGiven(String(v))}>{fcfa(v)}</button>)}
            </div>
            {given !== "" && <p className={`mt-2 text-lg font-bold ${short ? "text-red-600" : "text-emerald-700"}`}>{short ? `Il manque ${fcfa(total - Number(given))}` : `Monnaie à rendre : ${fcfa(change)}`}</p>}
          </div>
        )}
        {method !== "especes" && <Field label={method === "mobile_money" ? "Référence de la transaction Mobile Money" : "Référence du paiement par carte"} hint="Paiement déclaré par le caissier : vérifiez la confirmation reçue avant de valider."><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={80} /></Field>}
        {(c.settings.allow_credit || partial) && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} /> Paiement partiel ou différé (le client paiera le reste plus tard)</label>
        )}
        {partial && <Field label="Montant payé maintenant (0 = tout à crédit)"><input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></Field>}
        <Card title={<span className="flex items-center gap-2 text-sm"><UserRound className="h-4 w-4" /> Client {needCustomer ? "(obligatoire pour un crédit)" : "(facultatif)"}</span>}>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" placeholder="Téléphone" inputMode="tel" value={cust.phone} onChange={(e) => setCust({ ...cust, id: "", phone: e.target.value })} aria-label="Téléphone du client" />
            <input className="input" placeholder="Nom" value={found?.data.name ?? cust.name} disabled={Boolean(found)} onChange={(e) => setCust({ ...cust, id: "", name: e.target.value })} aria-label="Nom du client" />
          </div>
          {found && <p className="mt-1 text-xs text-emerald-700">Client trouvé : {found.data.name}</p>}
        </Card>
      </div>
    </Modal>
  );
}

function ReceiptModal({ sale, change, saleId, onClose }: { sale: Sale; change: number; saleId: string; onClose: () => void }) {
  const c = useCtx();
  const logo = c.img(c.settings.logo_id);
  const abs = (u: string | null) => (u ? new URL(u, location.origin).toString() : null);
  const share = async () => {
    const text = receiptText(sale, c.settings);
    if (navigator.share) await navigator.share({ text }).catch(() => undefined);
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const invoice = async () => {
    const r = await c.run("sale.invoice", { sale_id: saleId }, { quiet: true });
    if (r?.number) printHtml(invoiceHtml({ ...sale, invoice_number: r.number }, c.settings, { logo: abs(logo) }));
  };
  return (
    <Modal title="Vente enregistrée" onClose={onClose} footer={<button className="btn btn-primary w-full" onClick={onClose}>Nouvelle vente</button>}>
      <div className="space-y-3 text-center">
        <p className="text-3xl font-bold">{fcfa(sale.total)}</p>
        {change > 0 && <p className="text-lg font-semibold text-emerald-700">Monnaie à rendre : {fcfa(change)}</p>}
        <p className="text-sm text-slate-500">{sale.number}{sale.offline_at ? " · envoyée dès le retour de la connexion" : ""}</p>
        {sale.offline_at && <Badge tone="amber">Hors connexion</Badge>}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <button className="btn btn-ghost flex-col !gap-1 !py-3 text-xs" onClick={() => printHtml(receiptHtml(sale, c.settings, { logo: abs(logo), seller: c.memberName(c.s.me), change }))}><Printer className="h-5 w-5" /> Imprimer le reçu</button>
          <button className="btn btn-ghost flex-col !gap-1 !py-3 text-xs" onClick={share}><Share2 className="h-5 w-5" /> Partager</button>
          <button className="btn btn-ghost flex-col !gap-1 !py-3 text-xs" disabled={Boolean(sale.offline_at)} onClick={invoice}><Printer className="h-5 w-5" /> Facture</button>
        </div>
      </div>
    </Modal>
  );
}

function OpenRegister({ onClose }: { onClose: () => void }) {
  const c = useCtx();
  const [float, setFloat] = useState("");
  return (
    <Modal title="Ouvrir la caisse" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={async () => (await c.run("register.open", { float: Number(float) || 0 })) && onClose()}>Ouvrir</button></>}>
      <Field label="Fond de caisse (FCFA)" hint="Argent déjà présent dans le tiroir pour rendre la monnaie."><input className="input text-lg" inputMode="numeric" value={float} onChange={(e) => setFloat(e.target.value.replace(/\D/g, ""))} placeholder="0" autoFocus /></Field>
    </Modal>
  );
}

function MoveCash({ register, onClose }: { register: Doc<Register>; onClose: () => void }) {
  const c = useCtx();
  const [f, setF] = useState({ type: "sortie" as "entree" | "sortie", amount: "", reason: "" });
  return (
    <Modal title="Entrée ou sortie d'argent" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!f.amount || !f.reason} onClick={async () => (await c.run("register.move", { register_id: register.id, ...f })) && onClose()}>Enregistrer</button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(["entree", "sortie"] as const).map((t) => <button key={t} onClick={() => setF({ ...f, type: t })} className={`rounded-xl border p-3 text-sm ${f.type === t ? "border-[var(--brand)] font-medium" : "border-slate-200"}`}>{t === "entree" ? "Entrée (apport)" : "Sortie (achat, dépôt…)"}</button>)}
        </div>
        <Field label="Montant (FCFA)"><input className="input" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="Motif"><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={200} placeholder="Ex. achat de sacs, dépôt à la banque" /></Field>
        {register.data.moves.length > 0 && (
          <ul className="text-xs text-slate-600">
            {register.data.moves.map((m) => <li key={m.id}>{m.type === "entree" ? "+" : "−"} {fcfa(m.amount)} · {m.reason}</li>)}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function CloseRegister({ register, expected, onClose }: { register: Doc<Register>; expected: number; onClose: () => void }) {
  const c = useCtx();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const diff = counted === "" ? null : Number(counted) - expected;
  return (
    <Modal title="Fermer la caisse" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={counted === ""} onClick={async () => (await c.run("register.close", { register_id: register.id, counted: Number(counted), note })) && onClose()}>Fermer la caisse</button></>}>
      <div className="space-y-3 text-sm">
        <p>Ouverte le {new Date(register.data.opened_at).toLocaleString("fr-FR")} avec un fond de {fcfa(register.data.float)}.</p>
        <p className="text-base">Montant théorique en espèces : <b>{fcfa(expected)}</b></p>
        <Field label="Montant compté dans le tiroir (FCFA)"><input className="input text-lg" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value.replace(/\D/g, ""))} autoFocus /></Field>
        {diff !== null && <p className={`font-semibold ${diff === 0 ? "text-emerald-700" : "text-red-600"}`}>{diff === 0 ? "Aucun écart." : `Écart : ${diff > 0 ? "+" : ""}${fcfa(diff)}`}</p>}
        <Field label="Commentaire (facultatif)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
      </div>
    </Modal>
  );
}

/** Lecture d'un code-barres par la caméra (navigateurs qui proposent BarcodeDetector, ex. Chrome Android). */
function CameraScan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Detector = (window as unknown as { BarcodeDetector: new (o: object) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        const det = new Detector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"] });
        while (!stop) {
          const r = await det.detect(video.current).catch(() => []);
          if (r[0]?.rawValue) return onCode(r[0].rawValue);
          await new Promise((res) => setTimeout(res, 250));
        }
      } catch {
        setErr("Caméra indisponible : autorisez l'accès à la caméra, ou utilisez un lecteur de code-barres.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);
  return (
    <Modal title="Scanner un code-barres" onClose={onClose}>
      {err ? <p className="text-sm text-red-600">{err}</p> : <video ref={video} className="w-full rounded-xl bg-black" playsInline muted />}
    </Modal>
  );
}
