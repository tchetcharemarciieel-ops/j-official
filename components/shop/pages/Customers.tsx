"use client";

import { Download, MessageCircle, Phone, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { customerStats, dueOf, type Customer, type Doc, type Order, type Sale } from "@/lib/shop/model";
import { useCtx } from "../context";
import { Badge, Empty, Field, Modal, Pager, SearchBox, downloadText, fcfa, paginate, timeFmt, toCsv } from "../ui";
import { SaleDetail } from "./Sales";

export function Customers() {
  const c = useCtx();
  const [q, setQ] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Doc<Customer> | "new" | null>(null);
  const [view, setView] = useState<string | null>(null);
  const sales = c.data.sale as Doc<Sale>[];
  const orders = c.data.order as Doc<Order>[];
  const rows = useMemo(
    () =>
      (c.data.customer as Doc<Customer>[])
        .map((x) => ({ x, st: customerStats(x.id, sales, orders) }))
        .filter(({ x, st }) => (!q || [x.data.name, x.data.phone].some((v) => v.toLowerCase().includes(q.toLowerCase()))) && (!onlyDue || st.due > 0))
        .sort((a, b) => b.st.spent - a.st.spent),
    [c.data.customer, sales, orders, q, onlyDue],
  );
  const pg = paginate(rows, page, 25);
  const sel = (c.data.customer as Doc<Customer>[]).find((x) => x.id === view);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Nom ou téléphone…" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Paiements en attente</label>
        <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Ajouter un client</button>
        <button className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadText("clients.csv", toCsv([["nom", "telephone", "adresse", "achats", "depense", "reste_du", "commandes"], ...rows.map(({ x, st }) => [x.data.name, x.data.phone, x.data.address, st.purchases, st.spent, st.due, st.orders])]))}><Download className="h-4 w-4" /> Exporter</button>
      </div>
      {rows.length === 0 ? (
        <Empty icon={Users} title="Aucun client" text="Les clients sont ajoutés à la caisse (avec leur téléphone) et automatiquement lors des commandes en ligne." />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {pg.rows.map(({ x, st }) => (
            <li key={x.id}>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setView(x.id)}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold">{x.data.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{x.data.name}</span>
                  <span className="block truncate text-xs text-slate-500">{x.data.phone || "Sans téléphone"} · {st.purchases} achat(s){st.orders ? ` · ${st.orders} commande(s)` : ""}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="text-sm font-semibold">{fcfa(st.spent)}</span>
                  {st.due > 0 && <Badge tone="amber">Doit {fcfa(st.due)}</Badge>}
                  {x.data.source === "en_ligne" && <Badge tone="blue">En ligne</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
      {edit && <CustomerForm customer={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {sel && <CustomerView customer={sel} onClose={() => setView(null)} onEdit={() => (setView(null), setEdit(sel))} />}
    </div>
  );
}

function CustomerForm({ customer, onClose }: { customer: Doc<Customer> | null; onClose: () => void }) {
  const c = useCtx();
  const [f, setF] = useState({ name: customer?.data.name ?? "", phone: customer?.data.phone ?? "", address: customer?.data.address ?? "", notes: customer?.data.notes ?? "" });
  return (
    <Modal title={customer ? "Modifier le client" : "Nouveau client"} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!f.name} onClick={async () => (await c.run("customer.save", { id: customer?.id, ...f })) && onClose()}>Enregistrer</button></>}>
      <div className="space-y-3">
        <Field label="Nom"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} /></Field>
        <Field label="Téléphone"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} /></Field>
        <Field label="Adresse"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={200} /></Field>
        <Field label="Notes commerciales" hint="Visibles seulement par l'équipe autorisée."><textarea className="input" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} /></Field>
      </div>
    </Modal>
  );
}

function CustomerView({ customer, onClose, onEdit }: { customer: Doc<Customer>; onClose: () => void; onEdit: () => void }) {
  const c = useCtx();
  const [sale, setSale] = useState<string | null>(null);
  const sales = (c.data.sale as Doc<Sale>[]).filter((s) => s.data.customer_id === customer.id);
  const orders = (c.data.order as Doc<Order>[]).filter((o) => o.data.customer_id === customer.id);
  const st = customerStats(customer.id, c.data.sale as Doc<Sale>[], c.data.order as Doc<Order>[]);
  const tel = customer.data.phone.replace(/[^\d+]/g, "");
  const s = sales.find((x) => x.id === sale);
  return (
    <Modal wide title={customer.data.name} onClose={onClose} footer={<button className="btn btn-ghost" onClick={onEdit}>Modifier</button>}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          {tel && <a className="btn btn-ghost !py-1.5" href={`tel:${tel}`}><Phone className="h-4 w-4" /> {customer.data.phone}</a>}
          {tel && <a className="btn btn-ghost !py-1.5" href={`https://wa.me/${tel.replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Dépensé</p><p className="font-bold">{fcfa(st.spent)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Achats</p><p className="font-bold">{st.purchases}</p></div>
          <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-800">Reste dû</p><p className="font-bold">{fcfa(st.due)}</p></div>
        </div>
        {customer.data.address && <p>Adresse : {customer.data.address}</p>}
        {customer.data.notes && <p className="rounded-xl bg-slate-50 p-3 text-slate-700">{customer.data.notes}</p>}
        <div>
          <p className="mb-1 font-medium">Historique des achats</p>
          {sales.length ? (
            <ul className="divide-y divide-slate-100">
              {sales.map((x) => (
                <li key={x.id}><button className="flex w-full justify-between gap-2 py-2 text-left" onClick={() => setSale(x.id)}><span>{x.data.number} · {timeFmt(x.data.at)}{x.data.status === "annulee" ? " (annulée)" : ""}</span><span>{fcfa(x.data.total)}{dueOf(x.data) > 0 ? ` · reste ${fcfa(dueOf(x.data))}` : ""}</span></button></li>
              ))}
            </ul>
          ) : <p className="text-slate-500">Aucun achat.</p>}
        </div>
        {orders.length > 0 && <p className="text-slate-600">Commandes en ligne : {orders.map((o) => o.data.number).join(", ")}</p>}
      </div>
      {s && <SaleDetail sale={s} onClose={() => setSale(null)} />}
    </Modal>
  );
}
