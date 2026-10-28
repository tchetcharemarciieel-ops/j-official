"use client";

import { Banknote, ChefHat, CircleCheck, Clock, FileText, Minus, Pencil, Plus, Receipt, ShoppingBag, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  MENU_CATEGORIES,
  MENU_CATEGORY_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAY_STATUS_LABELS,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtQty,
  inPeriod,
  orderDue,
  paidSums,
  payable,
  periodPreset,
  recipeCost,
  stayDue,
  stayTotal,
  type Doc,
  type Guest,
  type Item,
  type MenuCategory,
  type MenuItem,
  type Order,
  type Payment,
  type PaymentMethod,
  type Period,
  type Room,
  type Stay,
  type Table,
} from "@/lib/venue/model";
import { Btn, Card, Empty, Field, Modal, PeriodPicker, Pill, PrintDoc, ReadOnlyNote, Search, Stat, Tabs, byId, docs, downloadCsv, inp, isMgr, numOrEmpty, parseNum, useIdem, useV, type Tone } from "./ui";

const STATUS_TONE: Record<string, Tone> = { en_attente: "amber", en_preparation: "blue", prete: "green", servie: "slate", annulee: "red" };

// ---------- Carte (plats et boissons) ----------

export function MenuView({ recipes = false }: { recipes?: boolean }) {
  const { v, level, act } = useV();
  const [edit, setEdit] = useState<Doc<MenuItem> | "new" | null>(null);
  const [q, setQ] = useState("");
  const [inactive, setInactive] = useState(false);
  const items = docs<Item>(v.data.item);
  const menu = docs<MenuItem>(v.data.menu).filter((m) => (inactive || m.data.active) && (!q || m.data.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-3">
      <ReadOnlyNote need={2} />
      <div className="flex flex-wrap gap-2">
        <div className="min-w-40 flex-1"><Search value={q} onChange={setQ} placeholder="Rechercher un plat ou une boisson" /></div>
        {isMgr(level) && <Btn onClick={() => setEdit("new")}><Plus className="h-4 w-4" aria-hidden />Ajouter</Btn>}
      </div>
      {menu.length === 0 ? (
        <Empty text="La carte est vide. Ajoutez vos plats et boissons avec leurs prix réels." icon={Utensils} />
      ) : (
        MENU_CATEGORIES.map((c) => {
          const list = menu.filter((m) => m.data.category === c).sort((a, b) => a.data.name.localeCompare(b.data.name));
          if (!list.length) return null;
          return (
            <Card key={c} title={MENU_CATEGORY_LABELS[c]}>
              <ul className="divide-y divide-slate-100 text-sm">
                {list.map((m) => {
                  const cost = recipeCost(m.data, items);
                  return (
                    <li key={m.id} className={`flex items-start justify-between gap-2 py-2 ${m.data.active ? "" : "opacity-60"}`}>
                      <div className="min-w-0">
                        <p className="font-medium">{m.data.name} {!m.data.active && <Pill>Désactivé</Pill>}</p>
                        {recipes && (
                          <p className="text-xs text-slate-500">
                            {!cost.defined ? "Recette non définie" : cost.perPortion !== null ? `Coût estimé : ${fmtMoney(cost.perPortion)} / portion` : `Coût incomplet : prix manquant pour ${cost.missing.join(", ")}`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{fmtMoney(m.data.price)}</span>
                        {isMgr(level) && <button type="button" onClick={() => setEdit(m)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={`Modifier ${m.data.name}`}><Pencil className="h-3.5 w-3.5" aria-hidden /></button>}
                        {isMgr(level) && <Btn small kind="ghost" onClick={() => act("menu.toggle", { id: m.id, active: !m.data.active })}>{m.data.active ? "Désactiver" : "Réactiver"}</Btn>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}
      {isMgr(level) && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />Afficher les articles désactivés</label>}
      {edit && <MenuForm item={edit === "new" ? null : edit} recipes={recipes} onClose={() => setEdit(null)} />}
    </div>
  );
}

function MenuForm({ item, recipes, onClose }: { item: Doc<MenuItem> | null; recipes: boolean; onClose: () => void }) {
  const { v, act } = useV();
  const d = item?.data;
  const stock = docs<Item>(v.data.item).filter((i) => i.data.active && i.data.zone !== "toilettes");
  const [f, setF] = useState({ name: d?.name ?? "", category: d?.category ?? ("plat" as MenuCategory), price: numOrEmpty(d?.price), kitchen: d?.kitchen ?? true, portions: String(d?.portions ?? 1), recipe: d?.recipe.map((r) => ({ item_id: r.item_id, qty: String(r.qty) })) ?? [] });
  const [busy, setBusy] = useState(false);
  const cost = recipeCost({ ...(d ?? ({} as MenuItem)), recipe: f.recipe.filter((r) => r.item_id && parseNum(r.qty)).map((r) => ({ item_id: r.item_id, qty: parseNum(r.qty)! })), portions: Number(f.portions) || 1 } as MenuItem, stock);
  return (
    <Modal title={item ? `Modifier « ${d!.name} »` : "Nouvel article"} onClose={onClose} wide={recipes}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await act("menu.save", { id: item?.id, name: f.name, category: f.category, price: parseNum(f.price), kitchen: f.kitchen, portions: Number(f.portions) || 1, recipe: f.recipe.filter((x) => x.item_id && parseNum(x.qty)).map((x) => ({ item_id: x.item_id, qty: parseNum(x.qty) })) });
          setBusy(false);
          if (r) onClose();
        }}
      >
        <Field label="Nom"><input className={inp} required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Catégorie"><select className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as MenuCategory })}>{MENU_CATEGORIES.map((c) => <option key={c} value={c}>{MENU_CATEGORY_LABELS[c]}</option>)}</select></Field>
        <Field label="Prix de vente (FCFA)"><input className={inp} required inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.kitchen} onChange={(e) => setF({ ...f, kitchen: e.target.checked })} />Préparé en cuisine</label>
        {recipes && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3 sm:col-span-2">
            <div className="flex items-end justify-between gap-2">
              <p className="text-sm font-semibold">Recette (facultatif)</p>
              <Field label="Pour combien de portions" className="w-40"><input className={inp} inputMode="numeric" value={f.portions} onChange={(e) => setF({ ...f, portions: e.target.value })} /></Field>
            </div>
            {f.recipe.map((r, i) => (
              <div key={i} className="flex gap-2">
                <select className={inp} value={r.item_id} onChange={(e) => setF({ ...f, recipe: f.recipe.map((x, j) => (j === i ? { ...x, item_id: e.target.value } : x)) })} aria-label="Ingrédient">
                  <option value="">Ingrédient…</option>
                  {stock.map((s) => <option key={s.id} value={s.id}>{s.data.name} ({s.data.unit})</option>)}
                </select>
                <input className={`${inp} w-24`} inputMode="decimal" value={r.qty} onChange={(e) => setF({ ...f, recipe: f.recipe.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} aria-label="Quantité" placeholder="Qté" />
                <button type="button" className="rounded-lg px-2 text-slate-500 hover:bg-slate-100" onClick={() => setF({ ...f, recipe: f.recipe.filter((_, j) => j !== i) })} aria-label="Retirer"><Minus className="h-4 w-4" aria-hidden /></button>
              </div>
            ))}
            <Btn small kind="soft" onClick={() => setF({ ...f, recipe: [...f.recipe, { item_id: "", qty: "" }] })} disabled={stock.length === 0}><Plus className="h-3.5 w-3.5" aria-hidden />Ingrédient</Btn>
            {stock.length === 0 && <p className="text-xs text-slate-500">Ajoutez d&apos;abord les ingrédients dans le stock.</p>}
            {cost.defined && <p className="text-xs text-slate-600">{cost.total !== null ? `Coût estimé : ${fmtMoney(cost.total)} pour ${f.portions} portion(s), soit ${fmtMoney(cost.perPortion!)} par portion.` : `Coût non calculable : prix d'achat manquant pour ${cost.missing.join(", ")}.`}</p>}
            <p className="text-xs text-slate-500">Les ingrédients sont déduits du stock une seule fois, quand la commande passe en préparation.</p>
          </div>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit" busy={busy}>Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}

/** Recettes et portions : quantités nécessaires selon le nombre de portions et coût estimé. */
export function RecipesView() {
  const { v } = useV();
  const items = docs<Item>(v.data.item);
  const menu = docs<MenuItem>(v.data.menu).filter((m) => m.data.active && m.data.kitchen);
  const [pick, setPick] = useState(menu[0]?.id ?? "");
  const [portions, setPortions] = useState("10");
  const m = menu.find((x) => x.id === pick);
  const n = Math.max(1, Number(portions) || 1);
  return (
    <div className="space-y-3">
      <MenuView recipes />
      {menu.length > 0 && (
        <Card title="Calculer les quantités nécessaires">
          <div className="flex flex-wrap gap-2">
            <select className={`${inp} flex-1`} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Plat">{menu.map((x) => <option key={x.id} value={x.id}>{x.data.name}</option>)}</select>
            <Field label="Portions" className="w-28"><input className={inp} inputMode="numeric" value={portions} onChange={(e) => setPortions(e.target.value)} /></Field>
          </div>
          {m && (m.data.recipe.length === 0 ? (
            <p className="mt-2 text-sm text-amber-700">Recette non définie pour ce plat : modifiez-le dans la carte ci-dessus pour ajouter ses ingrédients.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {m.data.recipe.map((r) => {
                const it = items.find((i) => i.id === r.item_id);
                const needQ = (r.qty * n) / Math.max(1, m.data.portions);
                return (
                  <li key={r.item_id} className="flex justify-between">
                    <span>{it?.data.name ?? "Ingrédient supprimé"}</span>
                    <span className={it && it.data.qty < needQ ? "font-medium text-red-600" : "font-medium"}>{fmtQty(needQ)} {it?.data.unit}{it && ` · stock ${fmtQty(it.data.qty)}`}</span>
                  </li>
                );
              })}
            </ul>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------- Prise de commande ----------

export function OrderComposer({ source, tableZone, onCreated }: { source: Order["source"]; tableZone?: "salle" | "terrasse" | "restaurant"; onCreated?: (id: string) => void }) {
  const { v, level, act, settings } = useV();
  const [key, renew] = useIdem();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [cat, setCat] = useState<MenuCategory | "">("");
  const [tableId, setTableId] = useState("");
  const [stayId, setStayId] = useState("");
  const [customer, setCustomer] = useState("");
  const [busy, setBusy] = useState(false);
  const menu = docs<MenuItem>(v.data.menu).filter((m) => m.data.active);
  const tables = docs<Table>(v.data.table).filter((t) => t.data.active && (!tableZone ? t.data.zone !== "restaurant" || v.kind === "hotel" : t.data.zone === tableZone));
  const stays = docs<Stay>(v.data.stay).filter((s) => s.data.status === "arrivee");
  const rooms = docs<Room>(v.data.room);
  const lines = Object.entries(cart).filter(([, q]) => q > 0);
  const total = lines.reduce((a, [id, q]) => a + q * (menu.find((m) => m.id === id)?.data.price ?? 0), 0);
  const roomService = source === "room_service";
  if (level < 1) return <ReadOnlyNote />;
  if (menu.length === 0) return <Empty text="La carte est vide : ajoutez d'abord vos plats et boissons (prix réels)." icon={Utensils} />;
  const cats = MENU_CATEGORIES.filter((c) => menu.some((m) => m.data.category === c));
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto pb-1">
        <button type="button" onClick={() => setCat("")} className={`tab-press shrink-0 rounded-lg px-2.5 py-1 text-xs ${cat === "" ? "font-semibold text-white" : "bg-slate-100 text-slate-600"}`} style={cat === "" ? { background: "var(--app-primary)" } : undefined}>Tout</button>
        {cats.map((c) => <button key={c} type="button" onClick={() => setCat(c)} className={`tab-press shrink-0 rounded-lg px-2.5 py-1 text-xs ${cat === c ? "font-semibold text-white" : "bg-slate-100 text-slate-600"}`} style={cat === c ? { background: "var(--app-primary)" } : undefined}>{MENU_CATEGORY_LABELS[c]}</button>)}
      </div>
      <ul className="grid grid-cols-2 gap-1.5">
        {menu.filter((m) => !cat || m.data.category === cat).map((m) => {
          const q = cart[m.id] ?? 0;
          return (
            <li key={m.id}>
              <div className={`flex h-full flex-col rounded-xl border p-2 text-sm ${q ? "border-[var(--app-primary)] bg-slate-50" : "border-slate-200 bg-white"}`}>
                <button type="button" className="tab-press flex-1 text-left" onClick={() => setCart({ ...cart, [m.id]: q + 1 })}>
                  <span className="block font-medium leading-tight">{m.data.name}</span>
                  <span className="text-xs text-slate-500">{fmtMoney(m.data.price)}</span>
                </button>
                {q > 0 && (
                  <div className="mt-1 flex items-center justify-between">
                    <button type="button" className="tab-press grid h-7 w-7 place-items-center rounded-lg bg-white ring-1 ring-slate-200" onClick={() => setCart({ ...cart, [m.id]: q - 1 })} aria-label={`Retirer ${m.data.name}`}><Minus className="h-3.5 w-3.5" aria-hidden /></button>
                    <span className="font-semibold">{q}</span>
                    <button type="button" className="tab-press grid h-7 w-7 place-items-center rounded-lg bg-white ring-1 ring-slate-200" onClick={() => setCart({ ...cart, [m.id]: q + 1 })} aria-label={`Ajouter ${m.data.name}`}><Plus className="h-3.5 w-3.5" aria-hidden /></button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Card title="Commande en cours">
        {lines.length === 0 ? (
          <p className="text-sm text-slate-500">Touchez les articles pour les ajouter.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {lines.map(([id, q]) => {
              const m = menu.find((x) => x.id === id)!;
              return (
                <li key={id}>
                  <div className="flex justify-between"><span>{q} × {m.data.name}</span><span className="font-medium">{fmtMoney(q * m.data.price)}</span></div>
                  <input className={`${inp} mt-1 py-1 text-xs`} maxLength={200} placeholder="Demande particulière (facultatif)" value={notes[id] ?? ""} onChange={(e) => setNotes({ ...notes, [id]: e.target.value })} />
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {roomService ? (
            <Field label="Chambre (client en séjour)" className="sm:col-span-2">
              <select className={inp} value={stayId} onChange={(e) => setStayId(e.target.value)} required>
                <option value="">Choisir…</option>
                {stays.map((s) => <option key={s.id} value={s.id}>Chambre {rooms.find((r) => r.id === s.data.room_id)?.data.number} · {byId<Guest>(v.data.guest, s.data.guest_id)?.data.name ?? s.data.ref}</option>)}
              </select>
            </Field>
          ) : (
            tables.length > 0 && (
              <Field label="Table (facultatif)">
                <select className={inp} value={tableId} onChange={(e) => setTableId(e.target.value)}>
                  <option value="">Comptoir / à emporter</option>
                  {tables.map((t) => <option key={t.id} value={t.id}>Table {t.data.number}{t.data.zone === "terrasse" ? " (terrasse)" : ""}</option>)}
                </select>
              </Field>
            )
          )}
          {!roomService && <Field label="Client (facultatif)"><input className={inp} maxLength={120} value={customer} onChange={(e) => setCustomer(e.target.value)} /></Field>}
        </div>
        {roomService && stays.length === 0 && <p className="mt-2 text-xs text-slate-500">Aucun client en séjour : le service en chambre s&apos;ouvre après l&apos;arrivée enregistrée à la réception.</p>}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="text-lg font-bold">{fmtMoney(total)}</span>
          <Btn
            busy={busy}
            disabled={lines.length === 0 || (roomService && !stayId) || (roomService && !settings.room_service)}
            onClick={async () => {
              setBusy(true);
              const t = tables.find((x) => x.id === tableId);
              const r = await act("order.create", { source: roomService ? "room_service" : t ? (t.data.zone === "terrasse" ? "terrasse" : t.data.zone === "restaurant" ? "restaurant" : "salle") : source, table_id: tableId || null, stay_id: stayId || null, customer, lines: lines.map(([id, q]) => ({ menu_id: id, qty: q, note: notes[id] ?? "" })), idem: key });
              setBusy(false);
              if (r) {
                renew();
                setCart({});
                setNotes({});
                setCustomer("");
                if (r.id) onCreated?.(r.id);
              }
            }}
          >
            <ShoppingBag className="h-4 w-4" aria-hidden />Enregistrer la commande
          </Btn>
        </div>
        <p className="mt-1 text-xs text-slate-500">Les prix sont ceux de la carte, vérifiés par le serveur.</p>
      </Card>
    </div>
  );
}

// ---------- Liste et suivi des commandes ----------

export function OrdersList({ filter, onPay, title = "Commandes du jour", kitchenActions = false }: { filter?: (o: Doc<Order>) => boolean; onPay?: (id: string) => void; title?: string; kitchenActions?: boolean }) {
  const { v, level, act } = useV();
  const [day, setDay] = useState(periodPreset("today"));
  const [stayFor, setStayFor] = useState<Doc<Order> | null>(null);
  const tables = docs<Table>(v.data.table);
  const orders = docs<Order>(v.data.order).filter((o) => inPeriod(o.created_at, day) && (!filter || filter(o))).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pays = docs<Payment>(v.data.payment);
  return (
    <div className="space-y-3">
      <PeriodPicker value={day} onChange={setDay} />
      {orders.length === 0 ? (
        <Empty text="Aucune commande sur cette période." icon={ShoppingBag} />
      ) : (
        <Card title={title}>
          <ul className="space-y-2">
            {orders.map((o) => {
              const due = orderDue(o.data, pays, o.id);
              const t = tables.find((x) => x.id === o.data.table_id);
              return (
                <li key={o.id} className="rounded-xl border border-slate-200 p-2.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{o.data.number} <span className="font-normal text-slate-500">· {fmtDateTime(o.created_at)}{t && ` · table ${t.data.number}`}{o.data.customer && ` · ${o.data.customer}`}</span></p>
                      <p className="text-xs text-slate-600">{o.data.lines.map((l) => `${l.qty} × ${l.label}`).join(", ")}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Pill tone={STATUS_TONE[o.data.status]}>{ORDER_STATUS_LABELS[o.data.status]}</Pill>
                      {o.data.status !== "annulee" && <Pill tone={o.data.pay_status === "paye" || o.data.pay_status === "chambre" ? "green" : o.data.pay_status === "partiel" ? "amber" : "slate"}>{PAY_STATUS_LABELS[o.data.pay_status]}</Pill>}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="font-semibold">{fmtMoney(o.data.total)}{due > 0 && o.data.status !== "annulee" && <span className="ml-1 text-xs font-normal text-amber-700">reste {fmtMoney(due)}</span>}</span>
                    {level >= 1 && o.data.status !== "annulee" && (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {kitchenActions && o.data.status === "prete" && <Btn small kind="soft" onClick={() => act("order.status", { id: o.id, to: "servie" })}>Servie</Btn>}
                        {!kitchenActions && o.data.status === "en_attente" && <Btn small kind="soft" onClick={() => act("order.status", { id: o.id, to: "servie" })}>Servie</Btn>}
                        {!kitchenActions && o.data.status === "prete" && <Btn small kind="soft" onClick={() => act("order.status", { id: o.id, to: "servie" })}>Servie</Btn>}
                        {due > 0 && onPay && <Btn small onClick={() => onPay(o.id)}><Banknote className="h-3.5 w-3.5" aria-hidden />Encaisser</Btn>}
                        {v.kind === "hotel" && due > 0 && o.data.paid === 0 && <Btn small kind="ghost" onClick={() => setStayFor(o)}>Sur la note de chambre</Btn>}
                        {o.data.paid === 0 && <Btn small kind="danger" onClick={async () => { const reason = window.prompt("Motif de l'annulation :"); if (reason) await act("order.cancel", { id: o.id, reason }); }}>Annuler</Btn>}
                      </div>
                    )}
                  </div>
                  {o.data.stock_note && <p className="mt-1 text-[11px] text-slate-500">{o.data.stock_note}</p>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {stayFor && <ChargeRoom order={stayFor} onClose={() => setStayFor(null)} />}
    </div>
  );
}

function ChargeRoom({ order, onClose }: { order: Doc<Order>; onClose: () => void }) {
  const { v, act } = useV();
  const stays = docs<Stay>(v.data.stay).filter((s) => s.data.status === "arrivee");
  const rooms = docs<Room>(v.data.room);
  const [stayId, setStayId] = useState(order.data.stay_id ?? stays[0]?.id ?? "");
  const stay = stays.find((s) => s.id === stayId);
  const guest = stay ? byId<Guest>(v.data.guest, stay.data.guest_id) : undefined;
  return (
    <Modal title={`Ajouter ${order.data.number} à une note de chambre`} onClose={onClose}>
      {stays.length === 0 ? (
        <p className="text-sm text-slate-600">Aucun client en séjour : seule la note d&apos;un client arrivé peut recevoir des consommations.</p>
      ) : (
        <div className="space-y-3">
          <Field label="Séjour"><select className={inp} value={stayId} onChange={(e) => setStayId(e.target.value)}>{stays.map((s) => <option key={s.id} value={s.id}>Chambre {rooms.find((r) => r.id === s.data.room_id)?.data.number} · {byId<Guest>(v.data.guest, s.data.guest_id)?.data.name} · {s.data.ref}</option>)}</select></Field>
          {stay && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm">Vérifiez avec le client : <strong>{guest?.data.name}</strong>, réservation {stay.data.ref}, du {fmtDate(stay.data.arrival)} au {fmtDate(stay.data.departure)}.</p>}
          <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn disabled={!stayId} onClick={async () => (await act("order.charge_room", { id: order.id, stay_id: stayId }, { confirm: `Ajouter ${fmtMoney(order.data.total)} à la note du séjour ${stay?.data.ref} ?` })) && onClose()}>Confirmer l&apos;ajout</Btn></div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Encaissement ----------

export function PaymentForm({ target, targetId, onClose }: { target: "order" | "stay"; targetId: string; onClose: () => void }) {
  const { v, act } = useV();
  const [key, renew] = useIdem();
  const pays = docs<Payment>(v.data.payment);
  const sums = paidSums(pays, target, targetId);
  const order = target === "order" ? byId<Order>(v.data.order, targetId) : undefined;
  const stay = target === "stay" ? byId<Stay>(v.data.stay, targetId) : undefined;
  const total = order ? order.data.total : stay ? stayTotal(stay.data) : 0;
  const remaining = Math.max(0, total - sums.confirmed - sums.pending);
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState<PaymentMethod>("especes");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const a = parseNum(amount) ?? 0;
  const t = parseNum(tendered);
  const change = method === "especes" && t !== null ? t - a : null;
  return (
    <Modal title={`Encaisser ${order ? order.data.number : stay?.data.ref}`} onClose={onClose}>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="Total" value={fmtMoney(total)} />
        <Stat label="Déjà confirmé" value={fmtMoney(sums.confirmed)} tone="green" />
        <Stat label="Reste à payer" value={fmtMoney(remaining)} tone={remaining ? "amber" : "slate"} />
      </div>
      {sums.pending > 0 && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{fmtMoney(sums.pending)} en attente de confirmation (non compté comme encaissé).</p>}
      {remaining <= 0 ? (
        <p className="text-sm text-slate-600">Rien à encaisser.</p>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await act("payment.add", { target, target_id: targetId, amount: a, method, tendered: method === "especes" ? t : null, reference, verified, idem: key });
            setBusy(false);
            if (r) {
              renew();
              onClose();
            }
          }}
        >
          <Field label="Montant encaissé (FCFA)"><input className={inp} inputMode="numeric" required value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Mode de paiement"><select className={inp} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}</select></Field>
          {method === "especes" ? (
            <>
              <Field label="Somme remise par le client"><input className={inp} inputMode="numeric" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder="Ex. : 10000" /></Field>
              <div className="self-end rounded-xl bg-slate-50 px-3 py-2 text-sm">Monnaie à rendre : <strong className={change !== null && change < 0 ? "text-red-600" : ""}>{change === null ? "—" : fmtMoney(change)}</strong></div>
            </>
          ) : (
            <>
              <Field label="Référence de la transaction"><input className={inp} maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />Réception vérifiée</label>
              <p className="text-xs text-slate-500 sm:col-span-2">Sans vérification, le paiement reste « en attente » et ne compte pas dans les recettes tant qu&apos;il n&apos;est pas confirmé.</p>
            </>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit" busy={busy} disabled={a <= 0 || a > remaining || (change !== null && change < 0)}><Banknote className="h-4 w-4" aria-hidden />Enregistrer le paiement</Btn></div>
        </form>
      )}
    </Modal>
  );
}

/** Commandes à encaisser et paiements en attente de confirmation. */
export function PaymentsView({ target = "order" }: { target?: "order" | "stay" }) {
  const { v, level, act, name } = useV();
  const [pay, setPay] = useState<string | null>(null);
  const pays = docs<Payment>(v.data.payment);
  const pending = pays.filter((p) => p.data.status === "en_attente" && p.data.target === target).sort((a, b) => b.data.at.localeCompare(a.data.at));
  const unpaid = target === "order" ? docs<Order>(v.data.order).filter((o) => o.data.status !== "annulee" && orderDue(o.data, pays, o.id) > 0).sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];
  const label = (p: Payment) => (p.target === "order" ? byId<Order>(v.data.order, p.target_id)?.data.number : byId<Stay>(v.data.stay, p.target_id)?.data.ref) ?? "—";
  return (
    <div className="space-y-3">
      <ReadOnlyNote />
      {target === "order" && (
        <Card title="Commandes à encaisser">
          {unpaid.length === 0 ? (
            <Empty text="Aucune commande en attente de paiement." icon={CircleCheck} />
          ) : (
            <ul className="space-y-1.5">
              {unpaid.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span className="min-w-0"><span className="font-medium">{o.data.number}</span> <span className="text-xs text-slate-500">· {fmtDateTime(o.created_at)} · reste {fmtMoney(orderDue(o.data, pays, o.id))}</span></span>
                  {level >= 1 && <Btn small onClick={() => setPay(o.id)}><Banknote className="h-3.5 w-3.5" aria-hidden />Encaisser</Btn>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Card title="Paiements en attente de confirmation">
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun.</p>
        ) : (
          <ul className="space-y-1.5">
            {pending.map((p) => (
              <li key={p.id} className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span><span className="font-medium">{fmtMoney(p.data.amount)}</span> · {PAYMENT_METHOD_LABELS[p.data.method]} · {label(p.data)}</span>
                  <Pill tone="amber">En attente</Pill>
                </div>
                <p className="text-xs text-slate-500">{fmtDateTime(p.data.at)} · {name(p.data.by)}{p.data.reference && ` · réf. ${p.data.reference}`}</p>
                {level >= 1 && (
                  <div className="mt-1.5 flex gap-1.5">
                    <Btn small onClick={() => act("payment.confirm", { id: p.id }, { confirm: `Confirmer la réception de ${fmtMoney(p.data.amount)} ?` })}>Confirmer la réception</Btn>
                    {isMgr(level) && <Btn small kind="danger" onClick={async () => { const reason = window.prompt("Motif de l'annulation :"); if (reason) await act("payment.cancel", { id: p.id, reason }); }}>Annuler</Btn>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {pay && <PaymentForm target="order" targetId={pay} onClose={() => setPay(null)} />}
    </div>
  );
}

// ---------- Reçus et factures ----------

export function ReceiptsView() {
  const { v } = useV();
  const [period, setPeriod] = useState(periodPreset("today"));
  const [doc, setDoc] = useState<{ order: Doc<Order>; kind: "recu" | "facture" } | null>(null);
  const [q, setQ] = useState("");
  const pays = docs<Payment>(v.data.payment);
  const orders = docs<Order>(v.data.order)
    .filter((o) => o.data.status !== "annulee" && inPeriod(o.created_at, period) && (!q || o.data.number.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="space-y-3">
      <PeriodPicker value={period} onChange={setPeriod} />
      <Search value={q} onChange={setQ} placeholder="Numéro de commande" />
      {orders.length === 0 ? (
        <Empty text="Aucune commande sur cette période." icon={Receipt} />
      ) : (
        <ul className="space-y-1.5">
          {orders.map((o) => {
            const confirmed = payable(pays, "order", o.id).filter((p) => p.data.status === "confirme");
            return (
              <li key={o.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="min-w-0"><span className="font-medium">{o.data.number}</span> <span className="text-xs text-slate-500">· {fmtMoney(o.data.total)} · {PAY_STATUS_LABELS[o.data.pay_status]}</span></span>
                <span className="flex gap-1.5">
                  <Btn small kind="soft" disabled={confirmed.length === 0} title={confirmed.length === 0 ? "Un reçu n'est émis qu'après un paiement confirmé" : undefined} onClick={() => setDoc({ order: o, kind: "recu" })}><Receipt className="h-3.5 w-3.5" aria-hidden />Reçu</Btn>
                  <Btn small kind="ghost" onClick={() => setDoc({ order: o, kind: "facture" })}><FileText className="h-3.5 w-3.5" aria-hidden />Facture</Btn>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {doc && <OrderDocument order={doc.order} kind={doc.kind} onClose={() => setDoc(null)} />}
    </div>
  );
}

function OrderDocument({ order, kind, onClose }: { order: Doc<Order>; kind: "recu" | "facture"; onClose: () => void }) {
  const { v, appName, act } = useV();
  const fresh = byId<Order>(v.data.order, order.id) ?? order;
  const o = fresh.data;
  const pays = payable(docs<Payment>(v.data.payment), "order", order.id).filter((p) => p.data.status === "confirme");
  const paid = pays.reduce((a, p) => a + p.data.amount, 0);
  const table = byId<Table>(v.data.table, o.table_id);
  useEffect(() => {
    if (kind === "facture" && !o.receipt_no) void act("order.invoice", { id: order.id }, { quiet: true });
  }, [kind, o.receipt_no, act, order.id]);
  return (
    <PrintDoc title={kind === "recu" ? "Reçu" : "Facture"} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex justify-between gap-4">
          <div>
            <p className="text-lg font-bold">{appName}</p>
            <p className="text-xs text-slate-600">{kind === "recu" ? "Reçu de paiement" : `Facture ${o.receipt_no ?? "(numéro en cours d'attribution)"}`}</p>
          </div>
          <div className="text-right text-xs">
            <p>Commande <strong>{o.number}</strong></p>
            <p>{fmtDateTime(fresh.created_at)}</p>
            {table && <p>Table {table.data.number}</p>}
            {o.customer && <p>{o.customer}</p>}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th className="py-1">Article</th><th className="py-1 text-right">Qté</th><th className="py-1 text-right">Prix</th><th className="py-1 text-right">Total</th></tr></thead>
          <tbody>{o.lines.map((l) => <tr key={l.id} className="border-b border-slate-100"><td className="py-1">{l.label}</td><td className="py-1 text-right">{l.qty}</td><td className="py-1 text-right">{fmtMoney(l.unit_price)}</td><td className="py-1 text-right">{fmtMoney(l.qty * l.unit_price)}</td></tr>)}</tbody>
        </table>
        <div className="ml-auto w-60 space-y-0.5 text-sm">
          <p className="flex justify-between font-bold"><span>Total</span><span>{fmtMoney(o.total)}</span></p>
          <p className="flex justify-between"><span>Payé</span><span>{fmtMoney(paid)}</span></p>
          {o.pay_status === "chambre" ? <p className="text-xs">Ajouté à la note de chambre.</p> : <p className="flex justify-between"><span>Reste dû</span><span>{fmtMoney(Math.max(0, o.total - paid))}</span></p>}
        </div>
        {pays.length > 0 && (
          <div className="text-xs">
            <p className="font-semibold">Paiements confirmés</p>
            {pays.map((p) => <p key={p.id}>{p.data.receipt_no} · {fmtDateTime(p.data.confirmed_at ?? p.data.at)} · {PAYMENT_METHOD_LABELS[p.data.method]} · {fmtMoney(p.data.amount)}{p.data.change ? ` (monnaie rendue ${fmtMoney(p.data.change)})` : ""}</p>)}
          </div>
        )}
      </div>
    </PrintDoc>
  );
}

// ---------- Rapport de caisse ----------

export function CashReport() {
  const { v } = useV();
  const [period, setPeriod] = useState(periodPreset("today"));
  const pays = docs<Payment>(v.data.payment);
  const confirmed = pays.filter((p) => p.data.status === "confirme" && p.data.target === "order" && inPeriod(p.data.confirmed_at ?? p.data.at, period));
  const pending = pays.filter((p) => p.data.status === "en_attente" && p.data.target === "order");
  const orders = docs<Order>(v.data.order).filter((o) => o.data.status !== "annulee" && inPeriod(o.created_at, period));
  const byMethod = PAYMENT_METHODS.map((m) => ({ m, total: confirmed.filter((p) => p.data.method === m).reduce((a, p) => a + p.data.amount, 0) })).filter((x) => x.total > 0);
  const cashed = confirmed.reduce((a, p) => a + p.data.amount, 0);
  const days = useMemo(() => {
    const m = new Map<string, { orders: number; sales: number; cashed: number }>();
    for (const o of orders) {
      const k = o.created_at.slice(0, 10);
      const r = m.get(k) ?? { orders: 0, sales: 0, cashed: 0 };
      r.orders += 1;
      r.sales += o.data.total;
      m.set(k, r);
    }
    for (const p of confirmed) {
      const k = (p.data.confirmed_at ?? p.data.at).slice(0, 10);
      const r = m.get(k) ?? { orders: 0, sales: 0, cashed: 0 };
      r.cashed += p.data.amount;
      m.set(k, r);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [orders, confirmed]);
  return (
    <div className="space-y-3">
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Commandes" value={orders.length} />
        <Stat label="Ventes (commandes)" value={fmtMoney(orders.reduce((a, o) => a + o.data.total, 0))} />
        <Stat label="Encaissé confirmé" value={fmtMoney(cashed)} tone="green" />
        <Stat label="En attente" value={fmtMoney(pending.reduce((a, p) => a + p.data.amount, 0))} tone={pending.length ? "amber" : "slate"} />
      </div>
      <Card title="Encaissements par mode de paiement">
        {byMethod.length === 0 ? <p className="text-sm text-slate-500">Aucun paiement confirmé sur la période.</p> : <ul className="space-y-1 text-sm">{byMethod.map((x) => <li key={x.m} className="flex justify-between"><span>{PAYMENT_METHOD_LABELS[x.m]}</span><span className="font-medium">{fmtMoney(x.total)}</span></li>)}</ul>}
      </Card>
      <Card title="Historique par jour" actions={days.length > 0 ? <Btn small kind="ghost" onClick={() => downloadCsv("rapport-caisse.csv", ["Jour", "Commandes", "Ventes", "Encaissé confirmé"], days.map(([d, r]) => [d, r.orders, r.sales, r.cashed]))}>Exporter</Btn> : undefined}>
        {days.length === 0 ? <Empty text="Aucune vente enregistrée sur la période." /> : (
          <ul className="divide-y divide-slate-100 text-sm">{days.map(([d, r]) => <li key={d} className="flex justify-between py-1.5"><span>{fmtDate(d)} · {r.orders} commande(s)</span><span><span className="text-slate-500">{fmtMoney(r.sales)} vendus · </span><strong>{fmtMoney(r.cashed)}</strong> encaissés</span></li>)}</ul>
        )}
      </Card>
      <p className="text-xs text-slate-500">Seuls les paiements confirmés comptent comme encaissés. Les commandes ajoutées à une note de chambre sont encaissées avec le séjour.</p>
    </div>
  );
}

// ---------- Cuisine : commandes à préparer ----------

export function KitchenQueue() {
  const { v, level, act, api } = useV();
  useEffect(() => {
    api.setFast(true);
    return () => api.setFast(false);
  }, [api]);
  const tables = docs<Table>(v.data.table);
  const rooms = docs<Room>(v.data.room);
  const stays = docs<Stay>(v.data.stay);
  const orders = docs<Order>(v.data.order).filter((o) => ["en_attente", "en_preparation", "prete"].includes(o.data.status) && o.data.lines.some((l) => l.kitchen)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const [tab, setTab] = useState<"en_attente" | "en_preparation" | "prete">("en_attente");
  const list = orders.filter((o) => o.data.status === tab);
  const where = (o: Order) => (o.stay_id ? `Chambre ${rooms.find((r) => r.id === stays.find((s) => s.id === o.stay_id)?.data.room_id)?.data.number ?? "?"}` : o.table_id ? `Table ${tables.find((t) => t.id === o.table_id)?.data.number ?? "?"}` : "Comptoir");
  return (
    <div className="space-y-3">
      <Tabs label="Commandes à préparer" value={tab} onChange={setTab} tabs={[{ id: "en_attente", label: "En attente", icon: Clock, count: orders.filter((o) => o.data.status === "en_attente").length }, { id: "en_preparation", label: "En préparation", icon: ChefHat, count: orders.filter((o) => o.data.status === "en_preparation").length }, { id: "prete", label: "Prêtes", icon: CircleCheck, count: orders.filter((o) => o.data.status === "prete").length }]} />
      <p className="text-xs text-slate-500">Actualisation automatique toutes les quelques secondes. Les commandes viennent du restaurant et du service en chambre.</p>
      {list.length === 0 ? (
        <Empty text={tab === "en_attente" ? "Aucune nouvelle commande." : tab === "en_preparation" ? "Rien en préparation." : "Aucune commande prête en attente de service."} icon={ChefHat} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((o) => (
            <li key={o.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
              <div className="flex items-center justify-between"><span className="font-bold">{o.data.number}</span><span className="text-xs text-slate-500">{where(o.data)} · {fmtDateTime(o.created_at)}</span></div>
              <ul className="mt-2 space-y-1">
                {o.data.lines.filter((l) => l.kitchen).map((l) => (
                  <li key={l.id}><span className="font-semibold">{l.qty} ×</span> {l.label}{l.note && <span className="block text-xs font-medium text-amber-700">→ {l.note}</span>}</li>
                ))}
              </ul>
              {o.data.note && <p className="mt-1 text-xs text-amber-700">{o.data.note}</p>}
              {level >= 1 && (
                <div className="mt-2 flex gap-1.5">
                  {o.data.status === "en_attente" && <Btn small onClick={() => act("order.status", { id: o.id, to: "en_preparation" })}><ChefHat className="h-3.5 w-3.5" aria-hidden />Commencer</Btn>}
                  {o.data.status === "en_preparation" && <Btn small onClick={() => act("order.status", { id: o.id, to: "prete" })}><CircleCheck className="h-3.5 w-3.5" aria-hidden />Prête</Btn>}
                  {o.data.status === "prete" && <Btn small kind="soft" onClick={() => act("order.status", { id: o.id, to: "servie" })}>Servie</Btn>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ventes et encaissements d'un établissement avec séjours : note de chambre (hôtel). */
export function StayFolio({ stay, onClose }: { stay: Doc<Stay>; onClose: () => void }) {
  const { v, appName, act } = useV();
  const fresh = byId<Stay>(v.data.stay, stay.id) ?? stay;
  const s = fresh.data;
  const room = byId<Room>(v.data.room, s.room_id);
  const guest = byId<Guest>(v.data.guest, s.guest_id);
  const pays = payable(docs<Payment>(v.data.payment), "stay", stay.id).filter((p) => p.data.status === "confirme");
  const total = stayTotal(s);
  const paid = pays.reduce((a, p) => a + p.data.amount, 0);
  const n = Math.round((Date.parse(`${s.departure}T12:00:00`) - Date.parse(`${s.arrival}T12:00:00`)) / 86_400_000);
  useEffect(() => {
    if (!s.invoice_no) void act("stay.invoice", { id: stay.id }, { quiet: true });
  }, [s.invoice_no, act, stay.id]);
  return (
    <PrintDoc title="Facture du séjour" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex justify-between gap-4">
          <div>
            <p className="text-lg font-bold">{appName}</p>
            <p className="text-xs">Facture {s.invoice_no ?? "(numéro en cours d'attribution)"} · réservation {s.ref}</p>
          </div>
          <div className="text-right text-xs">
            <p><strong>{guest?.data.name}</strong></p>
            {guest?.data.phone && <p>{guest.data.phone}</p>}
            <p>Chambre {room?.data.number} · {room?.data.type}</p>
            <p>Du {fmtDate(s.arrival)} au {fmtDate(s.departure)}</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th className="py-1">Prestation</th><th className="py-1 text-right">Montant</th></tr></thead>
          <tbody>
            <tr className="border-b border-slate-100"><td className="py-1">Hébergement : {n} nuit(s) × {fmtMoney(s.rate)}</td><td className="py-1 text-right">{fmtMoney(n * s.rate)}</td></tr>
            {s.charges.map((c) => <tr key={c.id} className="border-b border-slate-100"><td className="py-1">{c.label} <span className="text-xs text-slate-500">({fmtDateTime(c.at)})</span></td><td className="py-1 text-right">{fmtMoney(c.amount)}</td></tr>)}
          </tbody>
        </table>
        <div className="ml-auto w-60 space-y-0.5 text-sm">
          <p className="flex justify-between font-bold"><span>Total</span><span>{fmtMoney(total)}</span></p>
          <p className="flex justify-between"><span>Payé (confirmé)</span><span>{fmtMoney(paid)}</span></p>
          <p className="flex justify-between"><span>Reste dû</span><span>{fmtMoney(Math.max(0, total - paid))}</span></p>
        </div>
        {pays.length > 0 && <div className="text-xs">{pays.map((p) => <p key={p.id}>{p.data.receipt_no} · {fmtDateTime(p.data.confirmed_at ?? p.data.at)} · {PAYMENT_METHOD_LABELS[p.data.method]} · {fmtMoney(p.data.amount)}</p>)}</div>}
      </div>
    </PrintDoc>
  );
}

export const stayBalance = (v: { data: { payment: Doc[] } }, s: Doc<Stay>) => stayDue(s.data, docs<Payment>(v.data.payment), s.id);
export type { Period };
