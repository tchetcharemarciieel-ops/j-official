"use client";

import { Banknote, MessageCircle, Phone, RefreshCw, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OPEN_ORDER, ORDER_FLOW, ORDER_STATUS, PAY_METHODS, PAY_MODE_LABELS, PAY_STATUS_LABELS, type Doc, type Order, type OrderStatus, type Register } from "@/lib/shop/model";
import { api } from "@/lib/fetcher";
import { useCtx } from "../context";
import { Badge, Card, Empty, Field, Modal, Pager, SearchBox, Tabs, dateFmt, fcfa, paginate, timeFmt } from "../ui";

const tone = (s: OrderStatus) => (s === "nouvelle" || s === "attente" ? "red" : OPEN_ORDER.includes(s) ? "amber" : s === "annulee" || s === "remboursee" ? "slate" : "green") as "red" | "amber" | "slate" | "green";
const payTone = (s: Order["pay_status"]) => (s === "paye" ? "green" : s === "non_confirme" || s === "a_rembourser" ? "red" : "slate") as "green" | "red" | "slate";
const ACTION: Partial<Record<OrderStatus, string>> = { confirmee: "Confirmer la commande", preparation: "En préparation", prete: "Prête", livraison: "Partie en livraison", livree: "Livrée", retiree: "Retirée", annulee: "Refuser", remboursee: "Rembourser" };
const payLabel = (o: Order) => (o.pay_mode === "zingopay" ? PAY_MODE_LABELS.zingopay : o.mode === "livraison" ? PAY_MODE_LABELS.livraison : PAY_MODE_LABELS.retrait);

/** Commandes en ligne : confirmer ou refuser, suivre la préparation et la livraison, encaisser, historique des paiements. */
export function Orders() {
  const c = useCtx();
  const [tab, setTab] = useState<"open" | "done" | "cancel" | "pay">("open");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(c.focus);
  const [checking, setChecking] = useState(false);
  useEffect(() => setOpen(c.focus), [c.focus]);
  const orders = useMemo(() => (c.data.order as Doc<Order>[]).slice().sort((a, b) => b.data.at.localeCompare(a.data.at)), [c.data.order]);
  const rows = orders
    .filter((o) => (tab === "open" ? OPEN_ORDER.includes(o.data.status) : tab === "done" ? ["livree", "retiree"].includes(o.data.status) : ["annulee", "remboursee"].includes(o.data.status)))
    .filter((o) => !q || [o.data.number, o.data.customer.name, o.data.customer.phone].some((x) => x.toLowerCase().includes(q.toLowerCase())));
  const pg = paginate(rows, page, 25);
  const sel = orders.find((o) => o.id === open);
  const waitingZp = orders.some((o) => o.data.pay_mode === "zingopay" && o.data.pay_status === "en_attente" && o.data.status !== "annulee");

  const verify = async () => {
    setChecking(true);
    try {
      const r = await api<{ checked: number; paid: number; configured?: boolean }>(`/api/projects/${c.projectId}/zingopay/check`, { body: { mode: c.mode } });
      c.notify(r.paid ? "success" : "info", r.configured === false ? "ZingoPay n'est pas connecté." : r.checked ? `${r.checked} paiement(s) vérifié(s) chez ZingoPay : ${r.paid} confirmé(s).` : "Aucun paiement ZingoPay en attente.");
      await c.load();
    } catch (e) {
      c.notify("error", e instanceof Error ? e.message : "Vérification impossible.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={(v) => (setTab(v), setPage(1))} items={[["open", `En cours (${orders.filter((o) => OPEN_ORDER.includes(o.data.status)).length})`], ["done", "Terminées"], ["cancel", "Refusées / annulées"], ["pay", "Paiements"]]} />
        {tab !== "pay" && <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder="Numéro, nom, téléphone…" /></div>}
        {waitingZp && <button className="btn btn-ghost ml-auto" onClick={verify} disabled={checking}><RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} /> Vérifier les paiements ZingoPay</button>}
      </div>
      {tab === "pay" ? (
        <Payments orders={orders} onOpen={setOpen} />
      ) : rows.length === 0 ? (
        <Empty icon={ShoppingBag} title={tab === "open" ? "Aucune commande en cours" : "Aucune commande"} text={tab === "open" ? "Les commandes passées depuis votre boutique en ligne arrivent ici « En attente de confirmation », avec une notification." : undefined} />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {pg.rows.map((o) => {
            const expired = OPEN_ORDER.includes(o.data.status) && o.data.reserved_until && Date.parse(o.data.reserved_until) < Date.now();
            return (
              <li key={o.id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setOpen(o.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{o.data.number} · {o.data.customer.name}</span>
                    <span className="block truncate text-xs text-slate-500">{timeFmt(o.data.at)} · {o.data.mode === "livraison" ? `Livraison : ${o.data.customer.address}` : "Retrait en boutique"} · {payLabel(o.data)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold">{fcfa(o.data.total)}</span>
                    <span className="flex flex-wrap justify-end gap-1">
                      <Badge tone={payTone(o.data.pay_status)}>{PAY_STATUS_LABELS[o.data.pay_status]}</Badge>
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
      {tab !== "pay" && <Pager page={pg.page} pages={pg.pages} onPage={setPage} />}
      {sel && <OrderDetail order={sel} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Historique des paiements : encaissements confirmés, paiements non confirmés, remboursements à faire. */
function Payments({ orders, onOpen }: { orders: Doc<Order>[]; onOpen: (id: string) => void }) {
  const c = useCtx();
  const [f, setF] = useState<"all" | "paye" | "attente" | "probleme">("all");
  const list = orders
    .filter((o) => (f === "all" ? true : f === "paye" ? o.data.pay_status === "paye" : f === "attente" ? o.data.pay_status === "en_attente" && o.data.status !== "annulee" : ["non_confirme", "a_rembourser"].includes(o.data.pay_status)))
    .slice(0, 300);
  const received = orders.reduce((a, o) => a + (o.data.payments ?? []).reduce((b, p) => b + p.amount, 0), 0);
  const toCollect = orders.filter((o) => o.data.pay_status === "en_attente" && OPEN_ORDER.includes(o.data.status) || (o.data.pay_status === "en_attente" && ["livree", "retiree"].includes(o.data.status))).reduce((a, o) => a + o.data.total, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card><p className="text-xs text-slate-500">Encaissé (commandes en ligne)</p><p className="text-lg font-bold">{fcfa(received)}</p></Card>
        <Card><p className="text-xs text-slate-500">À encaisser</p><p className="text-lg font-bold">{fcfa(toCollect)}</p></Card>
        <Card><p className="text-xs text-slate-500">Problèmes de paiement</p><p className="text-lg font-bold">{orders.filter((o) => ["non_confirme", "a_rembourser"].includes(o.data.pay_status)).length}</p></Card>
      </div>
      <Tabs value={f} onChange={setF} items={[["all", "Tous"], ["paye", "Encaissés"], ["attente", "Non encaissés"], ["probleme", "Non confirmés / à rembourser"]]} />
      {list.length === 0 ? <Empty icon={Banknote} title="Aucun paiement sur cette sélection" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-2">Commande</th><th className="px-2">Mode choisi</th><th className="px-2 text-right">Montant</th><th className="px-2">Paiement</th><th className="px-2">Détail</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen(o.id)}>
                  <td className="px-4 py-2"><span className="font-medium">{o.data.number}</span><span className="block text-xs text-slate-500">{o.data.customer.name} · {dateFmt(o.data.at)}</span></td>
                  <td className="px-2">{payLabel(o.data)}</td>
                  <td className="px-2 text-right font-semibold">{fcfa(o.data.total)}</td>
                  <td className="px-2"><Badge tone={payTone(o.data.pay_status)}>{PAY_STATUS_LABELS[o.data.pay_status]}</Badge></td>
                  <td className="px-2 text-xs text-slate-600">{(o.data.payments ?? []).map((p) => `${PAY_METHODS[p.method]}${p.verified ? " (vérifié par ZingoPay)" : ""} · ${c.memberName(p.by === "zingopay" ? null : p.by) === "Client en ligne" ? "ZingoPay" : c.memberName(p.by)} · ${timeFmt(p.at)}`).join(" ; ") || o.data.zp_error || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrderDetail({ order, onClose }: { order: Doc<Order>; onClose: () => void }) {
  const c = useCtx();
  const o = order.data;
  const [next, setNext] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState("");
  const [collect, setCollect] = useState(false);
  const [method, setMethod] = useState<"especes" | "mobile_money" | "carte" | "autre">("especes");
  const [ref, setRef] = useState("");
  const mine = (c.data.register as Doc<Register>[]).find((r) => r.data.status === "ouverte" && r.data.opened_by === c.s.me) ?? null;
  const tel = o.customer.phone.replace(/[^\d+]/g, "");
  const wa = tel.replace(/^\+/, "");
  const msg = encodeURIComponent(`Bonjour ${o.customer.name}, ${c.settings.name} : votre commande ${o.number} est « ${ORDER_STATUS[o.status].toLowerCase()} ».`);
  const options = ORDER_FLOW[o.status].filter((s) => !(s === "livraison" && o.mode !== "livraison") && !(s === "retiree" && o.mode !== "retrait") && !(s === "livree" && o.mode === "retrait"));
  const unconfirmedZp = o.pay_mode === "zingopay" && o.pay_status !== "paye";
  const canCollect = o.pay_mode !== "zingopay" && o.pay_status !== "paye" && ["confirmee", "preparation", "prete", "livraison", "livree", "retiree"].includes(o.status);
  const waiting = o.status === "attente" || o.status === "nouvelle";
  const submit = async () => {
    if (!next) return;
    if (await c.run("order.status", { id: order.id, to: next, note, register_id: mine?.id ?? null })) (setNext(null), setNote(""));
  };
  const doCollect = async () => {
    if (await c.run("order.collect", { id: order.id, method, ref, register_id: mine?.id ?? null })) setCollect(false);
  };
  return (
    <Modal wide title={`Commande ${o.number}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone(o.status)}>{ORDER_STATUS[o.status]}</Badge>
          <Badge tone={payTone(o.pay_status)}>{PAY_STATUS_LABELS[o.pay_status]}</Badge>
          <Badge tone="violet">{payLabel(o)}</Badge>
          {o.reserved_until && OPEN_ORDER.includes(o.status) && <span className="text-xs text-slate-500">Stock réservé jusqu'au {new Date(o.reserved_until).toLocaleString("fr-FR")}</span>}
        </div>
        {o.pay_status === "non_confirme" && <p className="rounded-xl bg-red-50 px-3 py-2 text-red-700">Paiement ZingoPay non confirmé{o.zp_error ? ` : ${o.zp_error}` : ""}. La commande est conservée ; le client peut réessayer depuis sa page de suivi. Vous ne pouvez la confirmer qu'une fois le paiement confirmé par ZingoPay.</p>}
        {o.pay_status === "a_rembourser" && (
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">Le client a payé {fcfa(o.total)} par ZingoPay : remboursez-le, puis notez-le ici.
            {c.s.can.remises && <button className="btn btn-ghost !py-1 text-xs" onClick={() => confirm("Confirmer que le remboursement a été effectué ?") && void c.run("order.refund_done", { id: order.id, note: "" })}>Remboursement effectué</button>}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-medium">{o.customer.name}</p>
            <p>{o.customer.phone}</p>
            {o.mode === "livraison" ? <p className="text-slate-600">Livraison : {o.customer.address}</p> : <p className="text-slate-600">Retrait en boutique</p>}
            {o.note && <p className="mt-1 text-slate-600">« {o.note} »</p>}
            <div className="mt-2 flex gap-2">
              <a className="btn btn-ghost !px-3 !py-1.5 text-xs" href={`tel:${tel}`}><Phone className="h-4 w-4" /> Appeler</a>
              <a className="btn btn-ghost !px-3 !py-1.5 text-xs" href={`https://wa.me/${wa}?text=${msg}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
            </div>
          </div>
          <ul className="space-y-1">
            {o.items.map((l, i) => <li key={i} className="flex justify-between gap-2"><span>{l.name} × {l.qty}</span><span>{fcfa(l.qty * l.unit_price)}</span></li>)}
            <li className="flex justify-between border-t border-slate-100 pt-1 text-base font-bold"><span>Montant total</span><span>{fcfa(o.total)}</span></li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-1 font-medium">Paiement</p>
          <p className="text-slate-600">Mode choisi par le client : <b>{payLabel(o)}</b>.{o.pay_mode !== "zingopay" && " Le client ne paie rien à la commande."}</p>
          {(o.payments ?? []).map((p) => <p key={p.id} className="mt-1 text-emerald-700">✓ {fcfa(p.amount)} encaissés · {PAY_METHODS[p.method]}{p.verified ? " · confirmé par ZingoPay" : ` · reçu confirmé par ${c.memberName(p.by)}`} · {timeFmt(p.at)}</p>)}
          {canCollect && !collect && <button className="btn btn-primary mt-2" onClick={() => setCollect(true)}><Banknote className="h-4 w-4" /> J'ai reçu l'argent ({fcfa(o.total)})</button>}
          {canCollect && collect && (
            <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3">
              <p>Confirmez uniquement si vous avez bien reçu <b>{fcfa(o.total)}</b> du client.</p>
              <Field label="Moyen reçu">
                <select className="input" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                  <option value="especes">Espèces</option><option value="mobile_money">Mobile Money</option><option value="carte">Carte bancaire</option><option value="autre">Autre</option>
                </select>
              </Field>
              {method === "especes" && !mine && <p className="text-red-600">Ouvrez votre caisse (page Caisse) pour enregistrer des espèces.</p>}
              {method !== "especes" && <Field label="Référence (facultatif)"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={80} /></Field>}
              <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setCollect(false)}>Annuler</button><button className="btn btn-primary" onClick={doCollect}>Oui, j'ai reçu l'argent</button></div>
            </div>
          )}
          {o.pay_mode !== "zingopay" && o.pay_status !== "paye" && !canCollect && !["annulee", "remboursee"].includes(o.status) && <p className="mt-2 text-xs text-slate-500">Confirmez d'abord la commande ; vous pourrez ensuite noter l'argent reçu.</p>}
        </div>

        <div>
          <p className="mb-1 font-medium">Historique de la commande</p>
          <ol className="space-y-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
            {o.history.map((h, i) => <li key={i}><b>{ORDER_STATUS[h.to]}</b> · {timeFmt(h.at)}{h.by ? ` · ${c.memberName(h.by)}` : " · client / système"}{h.note ? ` · ${h.note}` : ""}</li>)}
          </ol>
        </div>

        {options.length > 0 && !next && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {options.filter((s) => s !== "remboursee" || c.s.can.remises).map((s) => (
              <button key={s} disabled={s !== "annulee" && unconfirmedZp} title={s !== "annulee" && unconfirmedZp ? "Paiement ZingoPay non confirmé" : undefined} className={s === "annulee" ? "btn btn-danger" : s === options[0] ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setNext(s)}>{ACTION[s] ?? ORDER_STATUS[s]}</button>
            ))}
          </div>
        )}
        {next && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <p className="font-medium">{next === "annulee" ? (waiting ? "Refuser cette commande ?" : "Annuler cette commande ?") : `${ACTION[next]} ?`}</p>
            {next === "annulee" && <p className="text-slate-600">Le stock réservé est libéré. Le motif est montré au client.{o.pay_status === "paye" ? " Le client a déjà payé par ZingoPay : il faudra le rembourser." : ""}</p>}
            {(next === "livree" || next === "retiree") && <p className="text-slate-600">Une vente de {fcfa(o.total)} est enregistrée et le stock est déduit.{o.pay_status === "paye" ? "" : " L'argent reste « à encaisser » tant que vous n'avez pas confirmé l'avoir reçu."}</p>}
            <Field label={next === "annulee" && waiting ? "Motif du refus (obligatoire)" : "Note (facultatif)"}><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={next === "annulee" ? "Ex. produit épuisé, adresse hors zone" : ""} /></Field>
            <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setNext(null)}>Retour</button><button className={next === "annulee" ? "btn btn-danger" : "btn btn-primary"} disabled={next === "annulee" && waiting && !note.trim()} onClick={submit}>Confirmer</button></div>
          </div>
        )}
      </div>
    </Modal>
  );
}
