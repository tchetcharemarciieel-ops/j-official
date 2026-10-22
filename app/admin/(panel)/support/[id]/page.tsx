import Link from "next/link";
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { fmtDateTime } from "@/lib/status";
import { Badge, Card, PageHeader } from "@/components/admin/ui";
import { Action } from "@/components/admin/Action";
import { ReplyForm } from "@/components/admin/Controls";

export const metadata = { title: "Demande" };

const LABEL = { nouveau: "Nouveau", en_cours: "En cours", resolu: "Résolu" } as const;

export default async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = adminClient();
  const { data: t } = await db.from("support_tickets").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();
  const { data: messages } = await db.from("support_messages").select("body,from_admin,created_at").eq("ticket_id", id).order("created_at");
  return (
    <div className="space-y-4">
      <PageHeader title={t.subject} subtitle={`${t.name || t.email} · ${t.email} · reçue le ${fmtDateTime(t.created_at)}`} actions={<Link href="/admin/support" className="btn btn-ghost">Retour</Link>} />
      <Card title="Statut" actions={<Badge tone={t.status === "resolu" ? "green" : t.status === "en_cours" ? "amber" : "red"}>{LABEL[t.status as keyof typeof LABEL] ?? t.status}</Badge>}>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LABEL) as (keyof typeof LABEL)[]).filter((s) => s !== t.status).map((s) => (
            <Action key={s} url={`/api/admin/support/${id}`} method="PATCH" body={{ status: s }} label={`Marquer « ${LABEL[s]} »`} done="Statut mis à jour." />
          ))}
          {t.user_id && <Link href={`/admin/utilisateurs/${t.user_id}`} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100">Voir le compte</Link>}
        </div>
      </Card>
      <Card title="Échanges">
        <ol className="space-y-3">
          <li className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="block text-xs text-slate-500">Client · {fmtDateTime(t.created_at)}</span>{t.message}</li>
          {(messages ?? []).map((m, i) => (
            <li key={i} className={`whitespace-pre-line rounded-lg px-3 py-2 text-sm ${m.from_admin ? "ml-6 bg-blue-50" : "bg-slate-50"}`}>
              <span className="block text-xs text-slate-500">{m.from_admin ? "Équipe" : "Client"} · {fmtDateTime(m.created_at)}</span>
              {m.body}
            </li>
          ))}
        </ol>
        <div className="mt-4 border-t border-slate-100 pt-4"><ReplyForm ticketId={id} /></div>
      </Card>
    </div>
  );
}
