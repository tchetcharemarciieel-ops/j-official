"use client";

import { Download, MessageCircle, Phone, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { CLIENT_STATUS, INTERACTION_TYPES, balanceOf, type Client, type Comment, type ClientStatus, type Doc, type Document, type Interaction, type Invoice, type Project, type Quote } from "@/lib/bureau/model";
import { useCtx } from "../context";
import { Badge, DeleteButton, Empty, Field, Modal, Pager, SearchBox, StatusBadge, Tabs, downloadText, fmtDate, paginate, timeFmt, toCsv } from "../ui";

/** Clients : fiche, statut, historique des interactions, documents et factures associés. */
export function Clients() {
  const c = useCtx();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | ClientStatus>("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Doc<Client> | "new" | null>(null);
  const [view, setView] = useState<string | null>(c.focus);
  const canEdit = c.may("clients");
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (c.data.client as Doc<Client>[])
      .filter((x) => (!status || x.data.status === status) && (!n || [x.data.name, x.data.contact, x.data.phone, x.data.email].some((v) => v.toLowerCase().includes(n))))
      .sort((a, b) => a.data.name.localeCompare(b.data.name, "fr"));
  }, [c.data.client, q, status]);
  const pg = paginate(rows, page, 25);
  const sel = (c.data.client as Doc<Client>[]).find((x) => x.id === view);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Nom, contact, téléphone, e-mail…" /></div>
        <select className="input !w-auto" value={status} onChange={(e) => (setStatus(e.target.value as ClientStatus | ""), setPage(1))} aria-label="Statut"><option value="">Tous les statuts</option>{Object.entries(CLIENT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {canEdit && <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Ajouter un client</button>}
        <button className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadText("clients.csv", toCsv([["nom", "type", "contact", "telephone", "email", "adresse", "statut"], ...rows.map((x) => [x.data.name, x.data.kind, x.data.contact, x.data.phone, x.data.email, x.data.address, CLIENT_STATUS[x.data.status]])]))}><Download className="h-4 w-4" /> Exporter</button>
      </div>
      {rows.length === 0 ? (
        <Empty icon={Users} title={q || status ? "Aucun client trouvé" : "Aucun client"} text={!q && !status ? "Ajoutez votre premier client : coordonnées, statut, historique des échanges." : undefined} action={canEdit && !q && !status ? <button className="btn btn-primary" onClick={() => setEdit("new")}>Ajouter un client</button> : undefined} />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {pg.rows.map((x) => (
            <li key={x.id}>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setView(x.id)}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold">{x.data.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{x.data.name}</span><span className="block truncate text-xs text-slate-500">{[x.data.contact, x.data.phone, x.data.email].filter(Boolean).join(" · ") || "Coordonnées à compléter"}</span></span>
                <span className="flex flex-col items-end gap-1"><StatusBadge k={x.data.status} label={CLIENT_STATUS[x.data.status]} />{x.data.kind === "entreprise" && <Badge>Entreprise</Badge>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
      {edit && <ClientForm client={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {sel && <ClientView client={sel} onClose={() => setView(null)} onEdit={() => (setView(null), setEdit(sel))} />}
    </div>
  );
}

function ClientForm({ client, onClose }: { client: Doc<Client> | null; onClose: () => void }) {
  const c = useCtx();
  const d = client?.data;
  const [f, setF] = useState({ name: d?.name ?? "", kind: d?.kind ?? "particulier", contact: d?.contact ?? "", phone: d?.phone ?? "", email: d?.email ?? "", address: d?.address ?? "", status: d?.status ?? "prospect", notes: d?.notes ?? "" });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={client ? "Modifier le client" : "Nouveau client"} onClose={onClose} footer={
      <>
        {client && <DeleteButton confirmText={`Supprimer « ${client.data.name} » ? (Impossible s'il a des projets ou des documents : archivez-le alors.)`} onConfirm={async () => (await c.run("client.delete", { id: client.id })) && onClose()} />}
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!f.name.trim()} onClick={async () => (await c.run("client.save", { id: client?.id, ...f })) && onClose()}>Enregistrer</button>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom" className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={120} autoFocus /></Field>
        <Field label="Type"><select className="input" value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="particulier">Particulier</option><option value="entreprise">Entreprise</option></select></Field>
        <Field label="Statut"><select className="input" value={f.status} onChange={(e) => set("status", e.target.value)}>{Object.entries(CLIENT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Personne à contacter"><input className="input" value={f.contact} onChange={(e) => set("contact", e.target.value)} maxLength={120} /></Field>
        <Field label="Téléphone"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} maxLength={120} /></Field>
        <Field label="Adresse"><input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={200} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} /></Field>
      </div>
    </Modal>
  );
}

function ClientView({ client, onClose, onEdit }: { client: Doc<Client>; onClose: () => void; onEdit: () => void }) {
  const c = useCtx();
  const d = client.data;
  const [tab, setTab] = useState<"history" | "docs" | "projects">("history");
  const [type, setType] = useState<keyof typeof INTERACTION_TYPES>("appel");
  const [text, setText] = useState("");
  const hist = (c.data.interaction as Doc<Interaction>[]).filter((i) => i.data.client_id === client.id).sort((a, b) => b.data.at.localeCompare(a.data.at));
  const notes = (c.data.comment as Doc<Comment>[]).filter((x) => x.data.target === "client" && x.data.target_id === client.id);
  const docs = (c.data.document as Doc<Document>[]).filter((x) => x.data.client_id === client.id);
  const quotes = (c.data.quote as Doc<Quote>[]).filter((x) => x.data.client_id === client.id);
  const invs = (c.data.invoice as Doc<Invoice>[]).filter((x) => x.data.client_id === client.id);
  const projects = (c.data.project as Doc<Project>[]).filter((x) => x.data.client_id === client.id);
  const tel = d.phone.replace(/[^\d+]/g, "");
  return (
    <Modal wide title={d.name} onClose={onClose} footer={c.may("clients") ? <button className="btn btn-ghost" onClick={onEdit}>Modifier la fiche</button> : undefined}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge k={d.status} label={CLIENT_STATUS[d.status]} />
          {d.kind === "entreprise" && <Badge>Entreprise</Badge>}
          {tel && <a className="btn btn-ghost !px-3 !py-1.5 text-xs" href={`tel:${tel}`}><Phone className="h-4 w-4" /> {d.phone}</a>}
          {tel && <a className="btn btn-ghost !px-3 !py-1.5 text-xs" href={`https://wa.me/${tel.replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
          {d.email && <a className="btn btn-ghost !px-3 !py-1.5 text-xs" href={`mailto:${d.email}`}>{d.email}</a>}
        </div>
        {(d.contact || d.address) && <p className="text-slate-600">{[d.contact && `Contact : ${d.contact}`, d.address].filter(Boolean).join(" · ")}</p>}
        {d.notes && <p className="rounded-xl bg-slate-50 p-3 text-slate-700">{d.notes}</p>}
        <Tabs value={tab} onChange={setTab} items={[["history", `Historique (${hist.length})`], ["docs", `Documents (${docs.length + quotes.length + invs.length})`], ["projects", `Projets (${projects.length})`]]} />
        {tab === "history" && (
          <div className="space-y-3">
            {c.may("clients") && (
              <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); if (await c.run("interaction.add", { client_id: client.id, type, text })) setText(""); }}>
                <select className="input !w-auto" value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Type d'interaction">{Object.entries(INTERACTION_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <input className="input min-w-[10rem] flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ce qui s'est dit ou fait…" maxLength={2000} aria-label="Texte de l'interaction" />
                <button className="btn btn-primary" disabled={!text.trim()}>Ajouter</button>
              </form>
            )}
            {hist.length ? (
              <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
                {hist.map((i) => (
                  <li key={i.id} className="flex items-start gap-2"><span className="flex-1"><b>{INTERACTION_TYPES[i.data.type]}</b> · <span className="text-xs text-slate-500">{timeFmt(i.data.at)} · {c.memberName(i.data.by)}</span><span className="block text-slate-700">{i.data.text}</span></span>
                    {(c.s.can.manager || i.data.by === c.s.me) && c.may("clients") && <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => confirm("Supprimer cette interaction ?") && void c.run("interaction.delete", { id: i.id })}>Supprimer</button>}
                  </li>
                ))}
              </ol>
            ) : <p className="text-slate-500">Aucune interaction enregistrée.</p>}
            {notes.length > 0 && <p className="text-xs text-slate-500">{notes.length} commentaire(s) lié(s) à ce client.</p>}
          </div>
        )}
        {tab === "docs" && (
          <div className="space-y-3">
            {[...quotes.map((x) => ({ k: x.id, l: `Devis ${x.data.number}`, v: c.fmt(x.data.total) })), ...invs.map((x) => ({ k: x.id, l: `Facture ${x.data.number}`, v: `${c.fmt(x.data.total)}${balanceOf(x.data) ? ` · reste ${c.fmt(balanceOf(x.data))}` : ""}` })), ...docs.map((x) => ({ k: x.id, l: x.data.name, v: fmtDate(x.data.at) }))].map((x) => <p key={x.k} className="flex justify-between gap-2 border-b border-slate-100 py-1.5"><span>{x.l}</span><span className="text-slate-500">{x.v}</span></p>)}
            {!docs.length && !quotes.length && !invs.length && <p className="text-slate-500">Aucun document associé.</p>}
          </div>
        )}
        {tab === "projects" && (projects.length ? <ul className="space-y-1">{projects.map((p) => <li key={p.id}><button className="underline" onClick={() => (onClose(), c.go("projets", p.id))}>{p.data.name}</button></li>)}</ul> : <p className="text-slate-500">Aucun projet pour ce client.</p>)}
      </div>
    </Modal>
  );
}
