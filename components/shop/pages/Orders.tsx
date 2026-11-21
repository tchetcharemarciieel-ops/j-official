"use client";

import { MessageCircle, Phone, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { OPEN_ORDER, ORDER_FLOW, ORDER_STATUS, type Doc, type Order, type OrderStatus, type Register } from "@/lib/shop/model";
import { useCtx } from "../context";
import { Badge, Empty, Field, Modal, Pager, SearchBox, Tabs, fcfa, paginate, timeFmt } from "../ui";

const tone = (s: OrderStatus) => (OPEN_ORDER.includes(s) ? (s === "nouvelle" || s === "attente" ? "red" : "amber") : s === "annulee" || s === "remboursee" ? "slate" : "green") as "red" | "amber" | "slate" | "green";
const ACTION: Partial<Record<OrderStatus, string>> = { confirmee: "Confirmer", preparation: "En préparation", prete: "Prête", livraison: "Partie en livraison", livree: "Livrée et payée", retiree: "Retirée et payée", annulee: "Annuler", remboursee: "Rembourser" };

export function Orders() {
  const c = useCtx();
  const [tab, setTab] = useState<"open" | "done" | "cancel">("open");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(c.focus);
  useEffect(() => setOpen(c.focus), [c.focus]);
  const orders = (c.data.order as Doc<Order>[]).slice().sort((a, b) => b.data.at.localeCompare(a.data.at));
  const rows = orders
    .filter((o) => (tab === "open" ? OPEN_ORDER.includes(o.data.status) : tab === "done" ? ["livree", "retiree"].includes(o.data.status) : ["annulee", "remboursee"].includes(o.data.status)))
    .filter((o) => !q || [o.data.number, o.data.customer.name, o.data.customer.phone].some((x) => x.toLowerCase().includes(q.toLowerCase())));
  const pg = paginate(rows, page, 25);
  const sel = orders.find((o) => o.id === open);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={(v) => (setTab(v), setPage(1))} items={[["open", `En cours (${orders.filter((o) => OPEN_ORDER.includes(o.data.status)).length})`], ["done", "Terminées"], ["cancel", "Annulées"]]} />
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder="Numéro, nom, téléphone…" /></div>
      </div>
      {rows.length === 0 ? (
        <Empty icon={ShoppingBag} title={tab === "open" ? "Aucune commande en cours" : "Aucune commande"} text={tab === "open" ? "Les commandes passées depuis votre boutique en ligne arrivent ici, avec une notification." : undefined} />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {pg.rows.map((o) => {
            const expired = OPEN_ORDER.includes(o.data.status) && o.data.reserved_until && Date.parse(o.data.reserved_until) < Date.now();
            return (
              <li key={o.id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setOpen(o.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{o.data.number} · {o.data.customer.name}</span>
                    <span className="block truncate text-xs text-slate-500">{timeFmt(o.data.at)} · {o.data.mode === "livraison" ? `Livraison : ${o.data.customer.address}` : "Retrait en boutique"} · {o.data.items.filter((l) => l.product_id !== "__livraison").length} article(s)</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold">{fcfa(o.data.total)}</span>
                    <span className="flex gap-1">
                      {o.data.pay_status === "paye" && <Badge tone="green">Payée</Badge>}
                      {expired && <Badge tone="amber">Réservation expirée</Badge>}
                      <Badge tone={tone(o.data.status)}>{ORDER_STATUS[o.data.status]}</Badge>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
      {sel && <OrderDetail order={sel} onClose={() => setOpen(null)} />}
    </div>
  );
}

function OrderDetail({ order, onClose }: { order: Doc<Order>; onClose: () => void }) {
  const c = useCtx();
  const o = order.data;
  const [next, setNext] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("especes");
  const mine = (c.data.register as Doc<Register>[]).find((r) => r.data.status === "ouverte" && r.data.opened_by === c.s.me) ?? null;
  const tel = o.customer.phone.replace(/[^\d+]/g, "");
  const wa = tel.replace(/^\+/, "");
  const msg = encodeURIComponent(`Bonjour ${o.customer.name}, ${c.settings.name} : votre commande ${o.number} est « ${ORDER_STATUS[o.status].toLowerCase()} ».`);
  const options = ORDER_FLOW[o.status].filter((s) => !(s === "livraison" && o.mode !== "livraison") && !(s === "retiree" && o.mode !== "retrait") && !(s === "livree" && o.mode === "retrait"));
  const finishing = next === "livree" || next === "retiree";
  const submit = async () => {
    if (!next) return;
    if (await c.run("order.status", { id: order.id, to: next, note, pay_method: method, register_id: mine?.id ?? null })) setNext(null);
  };
  return (
    <Modal wide title={`Commande ${o.number}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone(o.status)}>{ORDER_STATUS[o.status]}</Badge>
          <Badge tone={o.pay_status === "paye" ? "green" : "slate"}>{o.pay_status === "paye" ? "Payée" : o.pay_status === "rembourse" ? "Remboursée" : o.pay_mode === "zingopay" ? "Paiement ZingoPay en attente" : o.pay_mode === "livraison" ? "Paiement à la livraison" : "Paiement au retrait"}</Badge>
          {o.reserved_until && OPEN_ORDER.includes(o.status) && <span className="text-xs text-slate-500">Stock réservé jusqu'au {new Date(o.reserved_until).toLocaleString("fr-FR")}</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-medium">{o.customer.name}</p>
            <p>{o.customer.phone}</p>
            {o.mode === "livraison" && <p className="text-slate-600">Livraison : {o.customer.address}</p>}
            {o.note && <p className="mt-1 text-slate-600">« {o.note} »</p>}
            <div className="mt-2 flex gap-2">
              <a className="btn btn-ghost !px-3 !py-1.5 text-xs" href={`tel:${tel}`}><Phone className="h-4 w-4" /> Appeler</a>
              <a className="btn btn-ghost !px-3 !py-1.5 text-xs" href={`https://wa.me/${wa}?text=${msg}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
            </div>
          </div>
          <ul className="space-y-1">
            {o.items.map((l, i) => <li key={i} className="flex justify-between gap-2"><span>{l.name} × {l.qty}</span><span>{fcfa(l.qty * l.unit_price)}</span></li>)}
            <li className="flex justify-between border-t border-slate-100 pt-1 font-bold"><span>Total</span><span>{fcfa(o.total)}</span></li>
          </ul>
        </div>
        <ol className="space-y-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
          {o.history.map((h, i) => <li key={i}><b>{ORDER_STATUS[h.to]}</b> · {timeFmt(h.at)}{h.by ? ` · ${c.memberName(h.by)}` : ""}{h.note ? ` · ${h.note}` : ""}</li>)}
        </ol>
        {options.length > 0 && !next && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {options.filter((s) => s !== "remboursee" || c.s.can.remises).map((s) => <button key={s} className={s === "annulee" ? "btn btn-danger" : s === options[0] ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setNext(s)}>{ACTION[s] ?? ORDER_STATUS[s]}</button>)}
          </div>
        )}
        {next && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <p className="font-medium">{ACTION[next]} la commande ?</p>
            {next === "annulee" && <p className="text-slate-600">Le stock réservé est libéré.{o.pay_status === "paye" ? " Le client a payé par ZingoPay : remboursez-le, puis notez-le ici." : ""}</p>}
            {finishing && o.pay_mode !== "zingopay" && (
              <>
                <Field label="Paiement reçu">
                  <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="especes">Espèces</option><option value="mobile_money">Mobile Money</option><option value="carte">Carte bancaire</option>
                  </select>
                </Field>
                {method === "especes" && !mine && <p className="text-red-600">Ouvrez votre caisse (page Caisse) pour encaisser des espèces.</p>}
              </>
            )}
            {finishing && <p className="text-slate-600">Une vente de {fcfa(o.total)} est enregistrée et le stock est déduit.</p>}
            <Field label="Note (facultatif)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
            <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setNext(null)}>Retour</button><button className={next === "annulee" ? "btn btn-danger" : "btn btn-primary"} onClick={submit}>Confirmer</button></div>
          </div>
        )}
      </div>
    </Modal>
  );
}
