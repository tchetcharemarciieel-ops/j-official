import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { Card, Empty, PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Recherche" };

/** Recherche globale : utilisateurs, entreprises, logiciels et demandes d'assistance. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const needle = q.trim().toLowerCase();
  const db = adminClient();
  const [{ data: users }, { data: projects }, { data: tickets }] = needle
    ? await Promise.all([
        db.from("profiles").select("id,email,full_name,company_name").limit(5000),
        db.from("projects").select("id,name,slug").limit(5000),
        db.from("support_tickets").select("id,subject,email").limit(5000),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const has = (...v: unknown[]) => v.some((x) => String(x ?? "").toLowerCase().includes(needle));
  const u = (users ?? []).filter((x) => has(x.email, x.full_name, x.company_name, x.id)).slice(0, 20);
  const p = (projects ?? []).filter((x) => has(x.name, x.slug, x.id)).slice(0, 20);
  const t = (tickets ?? []).filter((x) => has(x.subject, x.email, x.id)).slice(0, 20);
  return (
    <div className="space-y-4">
      <PageHeader title="Recherche" subtitle={needle ? `Résultats pour « ${q} »` : "Saisissez un nom, une adresse e-mail ou un identifiant dans la barre du haut."} />
      {needle && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={`Utilisateurs (${u.length})`}>{u.length ? <ul className="space-y-1 text-sm">{u.map((x) => <li key={x.id}><Link className="text-blue-700 hover:underline" href={`/admin/utilisateurs/${x.id}`}>{x.full_name || x.email}</Link> <span className="text-xs text-slate-500">{x.email}</span></li>)}</ul> : <Empty>Aucun.</Empty>}</Card>
          <Card title={`Mini-logiciels (${p.length})`}>{p.length ? <ul className="space-y-1 text-sm">{p.map((x) => <li key={x.id}><Link className="text-blue-700 hover:underline" href={`/admin/logiciels/${x.id}`}>{x.name}</Link> <span className="text-xs text-slate-500">/apps/{x.slug}</span></li>)}</ul> : <Empty>Aucun.</Empty>}</Card>
          <Card title={`Demandes (${t.length})`}>{t.length ? <ul className="space-y-1 text-sm">{t.map((x) => <li key={x.id}><Link className="text-blue-700 hover:underline" href={`/admin/support/${x.id}`}>{x.subject}</Link> <span className="text-xs text-slate-500">{x.email}</span></li>)}</ul> : <Empty>Aucune.</Empty>}</Card>
        </div>
      )}
    </div>
  );
}
