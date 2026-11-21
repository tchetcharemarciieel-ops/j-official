"use client";

import { ClipboardList, PackageCheck, Plus, Trash2, Truck } from "lucide-react";
import { useState } from "react";
import { PO_STATUS, hasVariants, poDue, poPaid, round2, variantLabel, type Doc, type Po, type Supplier } from "@/lib/shop/model";
import { useCtx } from "../context";
import { Badge, Card, Empty, Field, Modal, Tabs, fcfa, opKey, qtyFmt, timeFmt } from "../ui";

export function Suppliers() {
  const c = useCtx();
  const [tab, setTab] = useState<"po" | "suppliers">("po");
  const [edit, setEdit] = useState<Doc<Supplier> | "new" | null>(null);
  const [po, setPo] = useState<Doc<Po> | "new" | null>(null);
  const suppliers = c.data.supplier as Doc<Supplier>[];
  const pos = (c.data.po as Doc<Po>[]).slice().sort((a, b) => b.data.at.localeCompare(a.data.at));
  const supName = (id: string) => suppliers.find((s) => s.id === id)?.data.name ?? "—";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={setTab} items={[["po", "Bons de commande"], ["suppliers", "Fournisseurs"]]} />
        <button className="btn btn-ghost ml-auto" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Fournisseur</button>
        <button className="btn btn-primary" disabled={!suppliers.length} onClick={() => setPo("new")}><ClipboardList className="h-4 w-4" /> Bon de commande</button>
      </div>
      {tab === "suppliers" &&
        (suppliers.length === 0 ? <Empty icon={Truck} title="Aucun fournisseur" action={<button className="btn btn-primary" onClick={() => setEdit("new")}>Ajouter un fournisseur</button>} /> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {suppliers.map((s) => {
              const mine = pos.filter((p) => p.data.supplier_id === s.id);
              const due = mine.reduce((a, p) => a + poDue(p.data), 0);
              return (
                <button key={s.id} onClick={() => setEdit(s)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-slate-300">
                  <p className="font-medium">{s.data.name}</p>
                  <p className="text-xs text-slate-500">{[s.data.phone, s.data.email, s.data.address].filter(Boolean).join(" · ") || "Coordonnées à compléter"}</p>
                  <p className="mt-2 text-sm">{mine.length} bon(s) de commande · achats reçus {fcfa(mine.reduce((a, p) => a + p.data.items.reduce((b, l) => b + l.received * l.cost, 0), 0))}</p>
                  {due > 0 && <Badge tone="amber">Montant dû : {fcfa(due)}</Badge>}
                </button>
              );
            })}
          </div>
        ))}
      {tab === "po" &&
        (pos.length === 0 ? <Empty icon={ClipboardList} title="Aucun bon de commande" text={suppliers.length ? "Créez un bon de commande : à la réception, le stock se met à jour tout seul." : "Ajoutez d'abord un fournisseur."} /> : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {pos.map((p) => (
              <li key={p.id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setPo(p)}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{p.data.number} · {supName(p.data.supplier_id)}</span>
                    <span className="text-xs text-slate-500">{timeFmt(p.data.at)} · {p.data.items.length} article(s){p.data.expected_date ? ` · attendu le ${p.data.expected_date}` : ""}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold">{fcfa(p.data.total)}</span>
                    <Badge tone={p.data.status === "recue" ? "green" : p.data.status === "annulee" ? "slate" : p.data.status === "brouillon" ? "slate" : "amber"}>{PO_STATUS[p.data.status]}</Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      {edit && <SupplierForm supplier={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {po && <PoModal po={po === "new" ? null : po} onClose={() => setPo(null)} />}
    </div>
  );
}

function SupplierForm({ supplier, onClose }: { supplier: Doc<Supplier> | null; onClose: () => void }) {
  const c = useCtx();
  const [f, setF] = useState({ name: supplier?.data.name ?? "", phone: supplier?.data.phone ?? "", email: supplier?.data.email ?? "", address: supplier?.data.address ?? "", notes: supplier?.data.notes ?? "" });
  return (
    <Modal title={supplier ? "Fournisseur" : "Nouveau fournisseur"} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!f.name} onClick={async () => (await c.run("supplier.save", { id: supplier?.id, ...f })) && onClose()}>Enregistrer</button></>}>
      <div className="space-y-3">
        <Field label="Nom"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Téléphone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <Field label="Adresse"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function PoModal({ po, onClose }: { po: Doc<Po> | null; onClose: () => void }) {
  const c = useCtx();
  const suppliers = c.data.supplier as Doc<Supplier>[];
  const editable = !po || ((po.data.status === "brouillon" || po.data.status === "commandee") && po.data.items.every((l) => l.received === 0));
  const [supplier, setSupplier] = useState(po?.data.supplier_id ?? suppliers[0]?.id ?? "");
  const [items, setItems] = useState(po?.data.items.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id ?? "", qty: String(l.qty), cost: String(l.cost) })) ?? [{ product_id: "", variant_id: "", qty: "", cost: "" }]);
  const [date, setDate] = useState(po?.data.expected_date ?? "");
  const [note, setNote] = useState(po?.data.note ?? "");
  const [recv, setRecv] = useState<Record<number, { qty: string; lot: string; expiry: string }>>({});
  const [pay, setPay] = useState("");
  const [key] = useState(() => opKey("rec"));
  const [receiving, setReceiving] = useState(false);
  const total = items.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0);
  const save = async () => (await c.run("po.save", { id: po?.id, supplier_id: supplier, items: items.filter((l) => l.product_id).map((l) => ({ ...l, variant_id: l.variant_id || null })), expected_date: date, note })) && onClose();
  if (po && (!editable || receiving)) {
    const lines = Object.entries(recv).map(([i, v]) => ({ index: Number(i), qty: Number(v.qty.replace(",", ".")) || 0, lot: v.lot, expiry: v.expiry })).filter((l) => l.qty > 0);
    return (
      <Modal wide title={`${po.data.number} · ${PO_STATUS[po.data.status]}`} onClose={onClose}>
        <div className="space-y-4 text-sm">
          <p>Fournisseur : <b>{suppliers.find((s) => s.id === po.data.supplier_id)?.data.name}</b> · Total commandé {fcfa(po.data.total)} · Payé {fcfa(poPaid(po.data))} · Dû {fcfa(poDue(po.data))}</p>
          <ul className="space-y-2">
            {po.data.items.map((l, i) => {
              const left = round2(l.qty - l.received);
              const lotted = c.products.find((p) => p.id === l.product_id)?.data.track_expiry;
              return (
                <li key={i} className="rounded-xl bg-slate-50 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1">{l.name} · {qtyFmt(l.received)} / {qtyFmt(l.qty)} reçus · {fcfa(l.cost)} l'unité</span>
                    {left > 0 && po.data.status !== "annulee" && <input className="input !w-24" inputMode="decimal" placeholder={`max ${qtyFmt(left)}`} value={recv[i]?.qty ?? ""} onChange={(e) => setRecv({ ...recv, [i]: { ...(recv[i] ?? { lot: "", expiry: "" }), qty: e.target.value } })} aria-label={`Quantité reçue de ${l.name}`} />}
                  </div>
                  {lotted && recv[i]?.qty && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input className="input" placeholder="Lot" value={recv[i]!.lot} onChange={(e) => setRecv({ ...recv, [i]: { ...recv[i]!, lot: e.target.value } })} />
                      <input className="input" type="date" value={recv[i]!.expiry} onChange={(e) => setRecv({ ...recv, [i]: { ...recv[i]!, expiry: e.target.value } })} aria-label="Péremption" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {lines.length > 0 && <button className="btn btn-primary" onClick={async () => (await c.run("po.receive", { id: po.id, lines, op_key: key })) && onClose()}><PackageCheck className="h-4 w-4" /> Enregistrer la réception (stock mis à jour)</button>}
          {poDue(po.data) > 0 && c.s.can.finances && (
            <Card title="Payer le fournisseur">
              <div className="flex gap-2"><input className="input" inputMode="numeric" value={pay} onChange={(e) => setPay(e.target.value.replace(/\D/g, ""))} placeholder={String(poDue(po.data))} /><button className="btn btn-primary" disabled={!pay} onClick={async () => (await c.run("po.pay", { id: po.id, amount: pay })) && setPay("")}>Enregistrer</button></div>
            </Card>
          )}
        </div>
      </Modal>
    );
  }
  return (
    <Modal wide title={po ? `${po.data.number} (${PO_STATUS[po.data.status]})` : "Nouveau bon de commande"} onClose={onClose} footer={
      <>
        {po?.data.status === "brouillon" && <button className="btn btn-ghost mr-auto" onClick={async () => (await c.run("po.status", { id: po.id, to: "commandee" })) && onClose()}>Marquer comme envoyé</button>}
        {po && <button className="btn btn-danger" onClick={async () => confirm("Annuler ce bon de commande ?") && (await c.run("po.status", { id: po.id, to: "annulee" })) && onClose()}>Annuler le bon</button>}
        {po?.data.status === "commandee" && <button className="btn btn-ghost" onClick={async () => (await c.run("po.status", { id: po.id, to: "commandee" }).catch(() => null), onClose())} hidden>—</button>}
        <button className="btn btn-primary" disabled={!supplier || !items.some((l) => l.product_id && Number(l.qty) > 0)} onClick={save}>Enregistrer</button>
      </>
    }>
      <div className="space-y-3 text-sm">
        <Field label="Fournisseur">
          <select className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.data.name}</option>)}</select>
        </Field>
        {items.map((l, i) => {
          const p = c.products.find((x) => x.id === l.product_id);
          return (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-5">
              <select className="input sm:col-span-2" value={l.product_id} onChange={(e) => {
                const np = c.products.find((x) => x.id === e.target.value);
                setItems(items.map((y, k) => (k === i ? { ...y, product_id: e.target.value, variant_id: "", cost: y.cost || String(np?.data.buy_price ?? "") } : y)));
              }} aria-label="Produit">
                <option value="">Produit…</option>
                {c.products.map((x) => <option key={x.id} value={x.id}>{x.data.name}</option>)}
              </select>
              {p && hasVariants(p.data) ? (
                <select className="input" value={l.variant_id} onChange={(e) => setItems(items.map((y, k) => (k === i ? { ...y, variant_id: e.target.value } : y)))} aria-label="Variante">
                  <option value="">Variante…</option>
                  {p.data.variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v)}</option>)}
                </select>
              ) : <span />}
              <input className="input" inputMode="decimal" placeholder="Quantité" value={l.qty} onChange={(e) => setItems(items.map((y, k) => (k === i ? { ...y, qty: e.target.value.replace(/[^\d.,]/g, "") } : y)))} aria-label="Quantité" />
              <div className="flex gap-1">
                <input className="input" inputMode="numeric" placeholder="Prix unitaire" value={l.cost} onChange={(e) => setItems(items.map((y, k) => (k === i ? { ...y, cost: e.target.value.replace(/\D/g, "") } : y)))} aria-label="Prix d'achat unitaire" />
                <button className="px-1 text-slate-400 hover:text-red-600" onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label="Retirer"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          );
        })}
        <button className="btn btn-ghost !py-1.5" onClick={() => setItems([...items, { product_id: "", variant_id: "", qty: "", cost: "" }])}><Plus className="h-4 w-4" /> Ajouter une ligne</button>
        <p className="text-right font-semibold">Total : {fcfa(total)}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Livraison attendue le"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        {po?.data.status === "commandee" && <p className="text-slate-500">Marchandises arrivées ? Réceptionnez tout d'un coup, ou enregistrez une première quantité : le bon passe alors en réception partielle.</p>}
        {po?.data.status === "commandee" && <div className="flex flex-wrap gap-2"><ReceiveNow po={po} onDone={onClose} /><button className="btn btn-ghost" onClick={() => setReceiving(true)}>Réception partielle…</button></div>}
      </div>
    </Modal>
  );
}

/** Bon envoyé, rien encore reçu : réception directe de tout ou partie. */
function ReceiveNow({ po, onDone }: { po: Doc<Po>; onDone: () => void }) {
  const c = useCtx();
  const [key] = useState(() => opKey("rec"));
  return <button className="btn btn-primary" onClick={async () => (await c.run("po.receive", { id: po.id, lines: po.data.items.map((l, i) => ({ index: i, qty: l.qty })), op_key: key })) && onDone()}><PackageCheck className="h-4 w-4" /> Tout est arrivé : réceptionner</button>;
}
