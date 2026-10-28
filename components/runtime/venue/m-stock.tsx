"use client";

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarClock, ClipboardCheck, Package, Pencil, Plus, Thermometer } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS,
  MOVE_TYPE_LABELS,
  coldLimits,
  expiryState,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtQty,
  searchable,
  stockAlerts,
  stockValue,
  today,
  type Doc,
  type Item,
  type ItemCategory,
  type Lot,
  type Move,
  type StockZone,
  type Temp,
} from "@/lib/venue/model";
import { Btn, Card, Empty, Field, Modal, Pill, ReadOnlyNote, Search, Stat, docs, downloadCsv, inp, isMgr, numOrEmpty, parseNum, useIdem, useV } from "./ui";

const zoneItems = (all: Doc[], zone: StockZone, withInactive = false) => docs<Item>(all).filter((i) => i.data.zone === zone && (withInactive || i.data.active));

// ---------- Produits ----------

export function ProductsView({ zone, categories = ITEM_CATEGORIES as unknown as ItemCategory[], cold }: { zone: StockZone; categories?: ItemCategory[]; cold?: boolean }) {
  const { v, level, act } = useV();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ItemCategory | "">("");
  const [showArchived, setShowArchived] = useState(false);
  const [edit, setEdit] = useState<Doc<Item> | "new" | null>(null);
  const [move, setMove] = useState<Doc<Item> | null>(null);
  const list = zoneItems(v.data.item, zone, showArchived)
    .filter((i) => (!cat || i.data.category === cat) && (!q || searchable(`${i.data.name} ${i.data.location}`).includes(searchable(q))))
    .sort((a, b) => a.data.name.localeCompare(b.data.name));
  return (
    <div className="space-y-3">
      <ReadOnlyNote />
      <div className="flex flex-wrap gap-2">
        <div className="min-w-40 flex-1"><Search value={q} onChange={setQ} placeholder="Rechercher un produit" /></div>
        <select className={`${inp} w-auto`} value={cat} onChange={(e) => setCat(e.target.value as ItemCategory | "")} aria-label="Catégorie">
          <option value="">Toutes catégories</option>
          {categories.map((c) => <option key={c} value={c}>{ITEM_CATEGORY_LABELS[c]}</option>)}
        </select>
        {level >= 1 && <Btn onClick={() => setEdit("new")}><Plus className="h-4 w-4" aria-hidden />Ajouter</Btn>}
      </div>
      {list.length === 0 ? (
        <Empty text={q || cat ? "Aucun produit ne correspond." : "Aucun produit enregistré. Ajoutez vos produits avec leur quantité réelle."} icon={Package} />
      ) : (
        <ul className="space-y-1.5">
          {list.map((i) => {
            const low = i.data.min_qty !== null && i.data.qty <= i.data.min_qty;
            return (
              <li key={i.id} className={`rounded-xl border bg-white p-2.5 text-sm ${i.data.active ? "border-slate-200" : "border-dashed border-slate-300 opacity-70"}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.data.name} {!i.data.active && <Pill>Archivé</Pill>}</p>
                    <p className="text-xs text-slate-500">
                      {ITEM_CATEGORY_LABELS[i.data.category]}
                      {i.data.location && ` · ${i.data.location}`}
                      {i.data.unit_price !== null ? ` · ${fmtMoney(i.data.unit_price)} / ${i.data.unit}` : " · prix non renseigné"}
                      {cold && (i.data.temp_min !== null || i.data.temp_max !== null) && ` · ${i.data.temp_min ?? "…"} à ${i.data.temp_max ?? "…"} °C`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${i.data.qty <= 0 ? "text-red-600" : low ? "text-amber-700" : ""}`}>{fmtQty(i.data.qty)} {i.data.unit}</p>
                    {i.data.min_qty !== null && <p className="text-[11px] text-slate-500">seuil {fmtQty(i.data.min_qty)}</p>}
                  </div>
                </div>
                {level >= 1 && i.data.active && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Btn small kind="soft" onClick={() => setMove(i)}><ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />Entrée / sortie</Btn>
                    <Btn small kind="ghost" onClick={() => setEdit(i)}><Pencil className="h-3.5 w-3.5" aria-hidden />Modifier</Btn>
                    {isMgr(level) && <Btn small kind="ghost" onClick={() => act("item.toggle", { id: i.id, active: false }, { confirm: `Archiver « ${i.data.name} » ? Son historique est conservé.` })}>Archiver</Btn>}
                  </div>
                )}
                {isMgr(level) && !i.data.active && <div className="mt-2"><Btn small kind="ghost" onClick={() => act("item.toggle", { id: i.id, active: true })}>Réactiver</Btn></div>}
              </li>
            );
          })}
        </ul>
      )}
      {isMgr(level) && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Afficher les produits archivés</label>}
      {edit && <ItemForm zone={zone} item={edit === "new" ? null : edit} categories={categories} cold={cold} onClose={() => setEdit(null)} />}
      {move && <MoveForm item={move} onClose={() => setMove(null)} />}
    </div>
  );
}

function ItemForm({ zone, item, categories, cold, onClose }: { zone: StockZone; item: Doc<Item> | null; categories: ItemCategory[]; cold?: boolean; onClose: () => void }) {
  const { act } = useV();
  const d = item?.data;
  const [f, setF] = useState({ name: d?.name ?? "", category: d?.category ?? categories[0]!, unit: d?.unit ?? (zone === "toilettes" ? "unité" : "kg"), unit_price: numOrEmpty(d?.unit_price), min_qty: numOrEmpty(d?.min_qty), location: d?.location ?? "", temp_min: numOrEmpty(d?.temp_min), temp_max: numOrEmpty(d?.temp_max), initial_qty: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={item ? `Modifier « ${d!.name} »` : "Nouveau produit"} onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await act("item.save", { id: item?.id, zone, name: f.name, category: f.category, unit: f.unit, unit_price: parseNum(f.unit_price), min_qty: parseNum(f.min_qty), location: f.location, temp_min: parseNum(f.temp_min), temp_max: parseNum(f.temp_max), initial_qty: item ? undefined : (parseNum(f.initial_qty) ?? undefined) });
          setBusy(false);
          if (r) onClose();
        }}
      >
        <Field label="Nom" className="sm:col-span-2"><input className={inp} required maxLength={120} value={f.name} onChange={set("name")} /></Field>
        <Field label="Catégorie"><select className={inp} value={f.category} onChange={set("category")}>{categories.map((c) => <option key={c} value={c}>{ITEM_CATEGORY_LABELS[c]}</option>)}</select></Field>
        <Field label="Unité" hint="kg, litre, bouteille, rouleau…"><input className={inp} required maxLength={20} value={f.unit} onChange={set("unit")} /></Field>
        <Field label="Prix d'achat unitaire (FCFA)" hint="Facultatif : sert au calcul de la valeur."><input className={inp} inputMode="numeric" value={f.unit_price} onChange={set("unit_price")} /></Field>
        <Field label="Seuil minimum" hint="Alerte quand la quantité l'atteint."><input className={inp} inputMode="decimal" value={f.min_qty} onChange={set("min_qty")} /></Field>
        <Field label="Emplacement" className="sm:col-span-2"><input className={inp} maxLength={80} value={f.location} onChange={set("location")} placeholder={zone === "froid" ? "Ex. : étagère haute" : "Ex. : rayon B"} /></Field>
        {cold && (
          <>
            <Field label="Conservation min (°C)"><input className={inp} inputMode="decimal" value={f.temp_min} onChange={set("temp_min")} /></Field>
            <Field label="Conservation max (°C)"><input className={inp} inputMode="decimal" value={f.temp_max} onChange={set("temp_max")} /></Field>
          </>
        )}
        {!item && <Field label="Quantité actuelle comptée" hint="Laissez vide si le produit n'est pas encore en stock." className="sm:col-span-2"><input className={inp} inputMode="decimal" value={f.initial_qty} onChange={set("initial_qty")} /></Field>}
        {item && <p className="text-xs text-slate-500 sm:col-span-2">La quantité ne se modifie que par une entrée, une sortie ou un ajustement d&apos;inventaire (historique conservé).</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Btn kind="ghost" onClick={onClose}>Annuler</Btn>
          <Btn type="submit" busy={busy}>Enregistrer</Btn>
        </div>
      </form>
    </Modal>
  );
}

function MoveForm({ item, onClose }: { item: Doc<Item>; onClose: () => void }) {
  const { act, level } = useV();
  const [key, renew] = useIdem();
  const [type, setType] = useState<"achat" | "livraison" | "utilisation" | "retrait" | "perte" | "vente" | "inventaire">("livraison");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState(numOrEmpty(item.data.unit_price));
  const [reason, setReason] = useState("");
  const [expense, setExpense] = useState(false);
  const [busy, setBusy] = useState(false);
  const incoming = type === "achat" || type === "livraison";
  return (
    <Modal title={`${item.data.name} · ${fmtQty(item.data.qty)} ${item.data.unit} en stock`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r =
            type === "inventaire"
              ? await act("item.count", { id: item.id, counted: parseNum(qty), reason: reason || "Inventaire", idem: key })
              : await act("item.move", { id: item.id, type, qty: parseNum(qty), unit_cost: incoming ? parseNum(cost) : null, reason, record_expense: expense, idem: key });
          setBusy(false);
          if (r) {
            renew();
            onClose();
          }
        }}
      >
        <Field label="Type de mouvement">
          <select className={inp} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <optgroup label="Entrées">
              <option value="livraison">Livraison reçue</option>
              <option value="achat">Achat</option>
            </optgroup>
            <optgroup label="Sorties">
              <option value="utilisation">Utilisé</option>
              <option value="retrait">Retiré</option>
              <option value="perte">Perte / périmé</option>
              <option value="vente">Vendu</option>
            </optgroup>
            {isMgr(level) && <option value="inventaire">Ajustement d&apos;inventaire (quantité comptée)</option>}
          </select>
        </Field>
        <Field label={type === "inventaire" ? `Quantité réellement comptée (${item.data.unit})` : `Quantité (${item.data.unit})`}><input className={inp} required inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        {incoming && <Field label="Prix d'achat unitaire (FCFA)" hint="Met à jour le prix utilisé pour la valeur du stock."><input className={inp} inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>}
        <Field label={type === "inventaire" ? "Motif de l'ajustement" : "Motif ou fournisseur (facultatif)"}><input className={inp} maxLength={200} required={type === "inventaire"} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {isMgr(level) && (incoming || type === "perte") && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={expense} onChange={(e) => setExpense(e.target.checked)} />Enregistrer aussi en dépense {type === "perte" ? "(perte valorisée au prix d'achat)" : ""}</label>}
        <div className="flex justify-end gap-2">
          <Btn kind="ghost" onClick={onClose}>Annuler</Btn>
          <Btn type="submit" busy={busy}>{incoming ? <ArrowDownToLine className="h-4 w-4" aria-hidden /> : <ArrowUpFromLine className="h-4 w-4" aria-hidden />}Enregistrer</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Mouvements ----------

export function MovesView({ zone }: { zone: StockZone }) {
  const { v, name, level } = useV();
  const [pick, setPick] = useState<Doc<Item> | null>(null);
  const items = zoneItems(v.data.item, zone, true);
  const ids = new Set(items.map((i) => i.id));
  const moves = docs<Move>(v.data.move).filter((m) => ids.has(m.data.item_id)).sort((a, b) => b.data.at.localeCompare(a.data.at)).slice(0, 80);
  const label = (id: string) => items.find((i) => i.id === id)?.data;
  return (
    <div className="space-y-3">
      {level >= 1 && (
        <Card title="Enregistrer un achat, une livraison ou une sortie">
          {items.filter((i) => i.data.active).length === 0 ? (
            <p className="text-sm text-slate-500">Ajoutez d&apos;abord vos produits (fonction « Gestion des produits »).</p>
          ) : (
            <select className={inp} value="" onChange={(e) => setPick(items.find((i) => i.id === e.target.value) ?? null)} aria-label="Produit">
              <option value="">Choisir le produit…</option>
              {items.filter((i) => i.data.active).sort((a, b) => a.data.name.localeCompare(b.data.name)).map((i) => <option key={i.id} value={i.id}>{i.data.name} ({fmtQty(i.data.qty)} {i.data.unit})</option>)}
            </select>
          )}
        </Card>
      )}
      <Card title="Historique des mouvements" actions={moves.length > 0 ? <Btn small kind="ghost" onClick={() => downloadCsv(`mouvements-${zone}.csv`, ["Date", "Produit", "Type", "Quantité", "Stock après", "Motif", "Par"], moves.map((m) => [fmtDateTime(m.data.at), label(m.data.item_id)?.name, MOVE_TYPE_LABELS[m.data.type], m.data.qty, m.data.balance_after, m.data.reason, name(m.data.by)]))}>Exporter</Btn> : undefined}>
        {moves.length === 0 ? (
          <Empty text="Aucun mouvement enregistré." />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {moves.map((m) => {
              const it = label(m.data.item_id);
              return (
                <li key={m.id} className="flex items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">{it?.name ?? "Produit supprimé"}</p>
                    <p className="text-xs text-slate-500">{MOVE_TYPE_LABELS[m.data.type]} · {fmtDateTime(m.data.at)} · {name(m.data.by)}{m.data.reason && ` · ${m.data.reason}`}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${m.data.qty < 0 ? "text-red-600" : "text-green-700"}`}>{m.data.qty > 0 ? "+" : ""}{fmtQty(m.data.qty)} {it?.unit}</p>
                    <p className="text-[11px] text-slate-500">reste {fmtQty(m.data.balance_after)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {pick && <MoveForm item={pick} onClose={() => setPick(null)} />}
    </div>
  );
}

// ---------- Alertes ----------

export function AlertsView({ zone }: { zone: StockZone }) {
  const { v, level } = useV();
  const [edit, setEdit] = useState<Doc<Item> | null>(null);
  const items = zoneItems(v.data.item, zone);
  const { out, low } = stockAlerts(items);
  const noThreshold = items.filter((i) => i.data.min_qty === null);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Épuisés" value={out.length} tone={out.length ? "red" : "slate"} />
        <Stat label="Sous le seuil" value={low.length} tone={low.length ? "amber" : "slate"} />
        <Stat label="Sans seuil" value={noThreshold.length} />
      </div>
      {out.length + low.length === 0 ? (
        <Empty text={items.length === 0 ? "Aucun produit enregistré." : "Aucun produit sous son seuil minimum."} icon={ClipboardCheck} />
      ) : (
        <Card title="À réapprovisionner">
          <ul className="space-y-1.5 text-sm">
            {[...out, ...low].map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-medium"><AlertTriangle className={`h-4 w-4 ${i.data.qty <= 0 ? "text-red-600" : "text-amber-600"}`} aria-hidden />{i.data.name}</span>
                  <span className="block text-xs text-slate-500">{fmtQty(i.data.qty)} {i.data.unit} pour un seuil de {fmtQty(i.data.min_qty!)}</span>
                </span>
                {level >= 1 && <Btn small kind="ghost" onClick={() => setEdit(i)}>Seuil</Btn>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {noThreshold.length > 0 && (
        <Card title="Produits sans seuil d'alerte">
          <p className="mb-2 text-xs text-slate-500">Définissez un seuil minimum pour être averti avant la rupture.</p>
          <ul className="flex flex-wrap gap-1.5">
            {noThreshold.map((i) => (
              <li key={i.id}><button type="button" disabled={level < 1} onClick={() => setEdit(i)} className="tab-press rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs hover:bg-slate-50">{i.data.name}</button></li>
            ))}
          </ul>
        </Card>
      )}
      {edit && <ThresholdForm item={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ThresholdForm({ item, onClose }: { item: Doc<Item>; onClose: () => void }) {
  const { act } = useV();
  const [min, setMin] = useState(numOrEmpty(item.data.min_qty));
  const d = item.data;
  return (
    <Modal title={`Seuil minimum · ${d.name}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act("item.save", { id: item.id, zone: d.zone, name: d.name, category: d.category, unit: d.unit, unit_price: d.unit_price, min_qty: parseNum(min), location: d.location, temp_min: d.temp_min, temp_max: d.temp_max })) onClose();
        }}
      >
        <Field label={`Seuil (${d.unit})`} hint="Laissez vide pour ne pas surveiller ce produit."><input className={inp} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} autoFocus /></Field>
        <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit">Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}

// ---------- Valeur ----------

export function ValueView({ zones }: { zones: StockZone[] }) {
  const { v } = useV();
  const items = docs<Item>(v.data.item).filter((i) => zones.includes(i.data.zone));
  const total = stockValue(items);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (i.data.active && i.data.unit_price !== null) m.set(i.data.category, (m.get(i.data.category) ?? 0) + Math.max(0, i.data.qty) * i.data.unit_price);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4 text-white" style={{ background: "var(--app-primary)" }}>
        <p className="text-xs opacity-80">Valeur estimée du stock</p>
        <p className="text-3xl font-bold">{fmtMoney(total.value)}</p>
        <p className="mt-1 text-xs opacity-80">Quantité en stock × dernier prix d&apos;achat saisi, pour {total.count - total.unpriced.length} produit(s) sur {total.count}.</p>
      </div>
      {byCat.length > 0 && (
        <Card title="Par catégorie">
          <ul className="space-y-1 text-sm">{byCat.map(([c, val]) => <li key={c} className="flex justify-between"><span>{ITEM_CATEGORY_LABELS[c as ItemCategory]}</span><span className="font-medium">{fmtMoney(val)}</span></li>)}</ul>
        </Card>
      )}
      {total.unpriced.length > 0 && (
        <Card title="Produits sans prix (exclus du calcul)">
          <p className="text-sm text-slate-600">{total.unpriced.map((i) => i.data.name).join(", ")}</p>
          <p className="mt-1 text-xs text-slate-500">Renseignez leur prix d&apos;achat (modification du produit ou entrée de stock) : aucun prix n&apos;est estimé à votre place.</p>
        </Card>
      )}
      {total.count === 0 && <Empty text="Aucun produit enregistré : la valeur sera calculée dès vos premières saisies." />}
    </div>
  );
}

// ---------- Dates et conservation ----------

export function LotsView({ zone }: { zone: StockZone }) {
  const { v, level, act, settings, name } = useV();
  const [form, setForm] = useState<Doc<Lot> | "new" | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const items = zoneItems(v.data.item, zone, true);
  const ids = new Set(items.map((i) => i.id));
  const lots = docs<Lot>(v.data.lot).filter((l) => ids.has(l.data.item_id) && (showClosed || !l.data.closed)).sort((a, b) => (a.data.expires ?? "9999").localeCompare(b.data.expires ?? "9999"));
  const warn = settings.expiry_warn_days;
  const states = lots.filter((l) => !l.data.closed).map((l) => expiryState(l.data, warn));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Dépassés" value={states.filter((s) => s === "expire").length} tone={states.includes("expire") ? "red" : "slate"} />
        <Stat label={`Sous ${warn} jour(s)`} value={states.filter((s) => s === "bientot").length} tone={states.includes("bientot") ? "amber" : "slate"} />
        <Stat label="Suivis" value={states.length} />
      </div>
      {level >= 1 && <Btn onClick={() => setForm("new")} disabled={items.filter((i) => i.data.active).length === 0}><CalendarClock className="h-4 w-4" aria-hidden />Enregistrer une réception</Btn>}
      {items.length === 0 && <p className="text-xs text-slate-500">Ajoutez d&apos;abord les produits de cette zone.</p>}
      {lots.length === 0 ? (
        <Empty text="Aucune date enregistrée." icon={CalendarClock} />
      ) : (
        <ul className="space-y-1.5">
          {lots.map((l) => {
            const it = items.find((i) => i.id === l.data.item_id);
            const st = l.data.closed ? "clos" : expiryState(l.data, warn);
            return (
              <li key={l.id} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{it?.data.name ?? "Produit supprimé"} · {fmtQty(l.data.qty)} {it?.data.unit}</p>
                    <p className="text-xs text-slate-500">Reçu le {fmtDate(l.data.received)} · DLC {l.data.expires ? fmtDate(l.data.expires) : "non renseignée"} · {name(l.data.by)}{l.data.note && ` · ${l.data.note}`}</p>
                  </div>
                  {st === "expire" ? <Pill tone="red">Date dépassée</Pill> : st === "bientot" ? <Pill tone="amber">Bientôt</Pill> : st === "clos" ? <Pill>Écoulé</Pill> : st === "sans_date" ? <Pill>Sans date</Pill> : <Pill tone="green">OK</Pill>}
                </div>
                {level >= 1 && (
                  <div className="mt-2 flex gap-1.5">
                    {!l.data.closed && <Btn small kind="ghost" onClick={() => setForm(l)}>Modifier</Btn>}
                    <Btn small kind="ghost" onClick={() => act("lot.close", { id: l.id, closed: !l.data.closed })}>{l.data.closed ? "Rouvrir" : "Écoulé / retiré"}</Btn>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />Afficher les lots écoulés</label>
      {isMgr(level) && <WarnDays />}
      {form && <LotForm items={items.filter((i) => i.data.active)} lot={form === "new" ? null : form} onClose={() => setForm(null)} />}
    </div>
  );
}

function WarnDays() {
  const { settings, act } = useV();
  const [d, setD] = useState(String(settings.expiry_warn_days));
  return (
    <form className="flex items-end gap-2" onSubmit={async (e) => (e.preventDefault(), await act("settings.save", { expiry_warn_days: Number(d) }))}>
      <Field label="Alerter avant l'échéance (jours)" className="w-48"><input className={inp} inputMode="numeric" value={d} onChange={(e) => setD(e.target.value)} /></Field>
      <Btn small kind="ghost" type="submit">Enregistrer</Btn>
    </form>
  );
}

function LotForm({ items, lot, onClose }: { items: Doc<Item>[]; lot: Doc<Lot> | null; onClose: () => void }) {
  const { act } = useV();
  const [f, setF] = useState({ item_id: lot?.data.item_id ?? items[0]?.id ?? "", qty: numOrEmpty(lot?.data.qty), received: lot?.data.received ?? today(), expires: lot?.data.expires ?? "", note: lot?.data.note ?? "" });
  return (
    <Modal title={lot ? "Modifier les dates" : "Réception d'un produit daté"} onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act("lot.save", { id: lot?.id, item_id: f.item_id, qty: parseNum(f.qty) ?? 0, received: f.received, expires: f.expires, note: f.note })) onClose();
        }}
      >
        <Field label="Produit" className="sm:col-span-2"><select className={inp} value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })}>{items.map((i) => <option key={i.id} value={i.id}>{i.data.name}</option>)}</select></Field>
        <Field label="Quantité reçue"><input className={inp} inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <Field label="Date de réception"><input type="date" className={inp} required value={f.received} onChange={(e) => setF({ ...f, received: e.target.value })} /></Field>
        <Field label="Date limite de conservation" hint="Indiquée sur l'emballage ou fixée par vous." className="sm:col-span-2"><input type="date" className={inp} value={f.expires} min={f.received} onChange={(e) => setF({ ...f, expires: e.target.value })} /></Field>
        <Field label="Remarque" className="sm:col-span-2"><input className={inp} maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <p className="text-xs text-slate-500 sm:col-span-2">Pour ajouter la quantité au stock, enregistrez aussi la livraison dans « Entrées et sorties ».</p>
        <div className="flex justify-end gap-2 sm:col-span-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit">Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}

// ---------- Températures (saisie manuelle) ----------

export function TempView({ zone = "froid" }: { zone?: "froid" | "cuisine" }) {
  const { v, level, act, settings, name } = useV();
  const [key, renew] = useIdem();
  const [value, setValue] = useState("");
  const [equipment, setEquipment] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const lim = zone === "froid" ? coldLimits(settings, docs<Item>(v.data.item)) : { min: null, max: null, from: [], configured: false };
  const readings = docs<Temp>(v.data.temp).filter((t) => t.data.zone === zone).sort((a, b) => b.data.at.localeCompare(a.data.at));
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        <Thermometer className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Aucun capteur n&apos;est connecté : toutes les températures sont des relevés saisis à la main par l&apos;équipe et sont affichées comme tels.
      </p>
      {zone === "froid" && (
        <Card title="Seuils appliqués">
          {lim.configured ? (
            <p className="text-sm">Entre <strong>{lim.min ?? "—"} °C</strong> et <strong>{lim.max ?? "—"} °C</strong>{lim.from.length > 0 && <span className="text-slate-500"> (ajustés pour : {lim.from.join(", ")})</span>}</p>
          ) : (
            <p className="text-sm text-amber-700">Aucun seuil défini : les relevés sont enregistrés sans alerte.</p>
          )}
          {isMgr(level) && <ColdThresholds />}
        </Card>
      )}
      {level >= 1 && (
        <Card title="Saisir un relevé">
          <form
            className="grid gap-2 sm:grid-cols-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const r = await act("temp.add", { value: parseNum(value), zone, equipment, note, idem: key });
              setBusy(false);
              if (r) {
                renew();
                setValue("");
                setNote("");
              }
            }}
          >
            <Field label="Température (°C)"><input className={inp} required inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex. : 3,5" /></Field>
            <Field label={zone === "froid" ? "Appareil (facultatif)" : "Appareil contrôlé"}><input className={inp} maxLength={80} value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder={zone === "froid" ? "Chambre froide" : "Réfrigérateur 1"} /></Field>
            <Field label="Remarque"><input className={inp} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="sm:col-span-3"><Btn type="submit" busy={busy}><Thermometer className="h-4 w-4" aria-hidden />Enregistrer le relevé</Btn></div>
          </form>
        </Card>
      )}
      <Card title="Historique des relevés">
        {readings.length === 0 ? (
          <Empty text="Aucun relevé saisi." icon={Thermometer} />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {readings.slice(0, 60).map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{fmtQty(t.data.value)} °C {t.data.equipment && <span className="font-normal text-slate-500">· {t.data.equipment}</span>}</p>
                  <p className="text-xs text-slate-500">{fmtDateTime(t.data.at)} · saisie manuelle par {name(t.data.by)}{t.data.note && ` · ${t.data.note}`}</p>
                </div>
                {t.data.out ? <Pill tone={t.data.treated ? "slate" : "red"}>{t.data.treated ? "Alerte traitée" : "Hors seuil"}</Pill> : <Pill tone="green">Conforme</Pill>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ColdThresholds() {
  const { settings, act } = useV();
  const [min, setMin] = useState(numOrEmpty(settings.cold_min));
  const [max, setMax] = useState(numOrEmpty(settings.cold_max));
  return (
    <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e) => (e.preventDefault(), await act("settings.save", { cold_min: parseNum(min), cold_max: parseNum(max) }))}>
      <Field label="Minimum (°C)" className="w-28"><input className={inp} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
      <Field label="Maximum (°C)" className="w-28"><input className={inp} inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} /></Field>
      <Btn small kind="ghost" type="submit">Enregistrer les seuils</Btn>
      <p className="w-full text-xs text-slate-500">Les seuils de conservation propres à chaque produit (fiche produit) sont aussi pris en compte.</p>
    </form>
  );
}

/** Alertes de la chambre froide : relevés hors seuils à traiter et produits proches de leur date. */
export function ColdAlerts() {
  const { v, level, act, settings, name } = useV();
  const open = docs<Temp>(v.data.temp).filter((t) => t.data.zone === "froid" && t.data.out && !t.data.treated).sort((a, b) => b.data.at.localeCompare(a.data.at));
  const items = zoneItems(v.data.item, "froid", true);
  const ids = new Set(items.map((i) => i.id));
  const lots = docs<Lot>(v.data.lot).filter((l) => ids.has(l.data.item_id) && !l.data.closed && ["expire", "bientot"].includes(expiryState(l.data, settings.expiry_warn_days)));
  const lastReading = docs<Temp>(v.data.temp).filter((t) => t.data.zone === "froid").sort((a, b) => b.data.at.localeCompare(a.data.at))[0];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Températures à traiter" value={open.length} tone={open.length ? "red" : "slate"} />
        <Stat label="Dates proches / dépassées" value={lots.length} tone={lots.length ? "amber" : "slate"} />
        <Stat label="Dernier relevé" value={lastReading ? `${fmtQty(lastReading.data.value)} °C` : "—"} />
      </div>
      {lastReading && Date.now() - Date.parse(lastReading.data.at) > 24 * 3600_000 && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Aucun relevé depuis plus de 24 heures ({fmtDateTime(lastReading.data.at)}).</p>}
      {open.length > 0 && (
        <Card title="Relevés hors seuils">
          <ul className="space-y-1.5">
            {open.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/50 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold text-red-700">{fmtQty(t.data.value)} °C</span> <span className="text-xs text-slate-600">{t.data.out_reason} · {fmtDateTime(t.data.at)} · {name(t.data.by)}</span>
                </span>
                {level >= 1 && <Btn small kind="ghost" onClick={async () => { const n = window.prompt("Action réalisée (facultatif) :") ?? ""; await act("temp.treat", { id: t.id, note: n }); }}>Traité</Btn>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {lots.length > 0 && (
        <Card title="Produits à vérifier">
          <ul className="space-y-1 text-sm">{lots.map((l) => <li key={l.id}>{items.find((i) => i.id === l.data.item_id)?.data.name} · DLC {fmtDate(l.data.expires)}</li>)}</ul>
        </Card>
      )}
      {open.length === 0 && lots.length === 0 && <Empty text="Aucune alerte en cours." icon={ClipboardCheck} />}
    </div>
  );
}
