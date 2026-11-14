import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { fmtDateTime } from "@/lib/status";
import { Badge, Card, Empty, PageHeader, Table, Tile } from "@/components/admin/ui";

export const metadata = { title: "Sites Internet connectés" };

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" }> = { connected: { label: "Connecté", tone: "green" }, pending: { label: "En attente du code", tone: "amber" }, error: { label: "Erreur", tone: "red" } };

/** Sites Internet reliés aux mini-logiciels : statut réel (première visite reçue) et visites des 30 derniers jours. */
export default async function Sites() {
  const db = adminClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: sites }, { data: projects }, { data: events }] = await Promise.all([
    db.from("websites").select("id,project_id,url,host,status,last_error,last_event_at,connected_at,created_at").order("created_at", { ascending: false }).limit(1000),
    db.from("projects").select("id,name,sector").limit(10000),
    db.from("web_events").select("site_id,visitor,type").gte("created_at", since).eq("type", "pageview").limit(100000),
  ]);
  const project = (id: string) => projects?.find((p) => p.id === id);
  const views = new Map<string, number>();
  const visitors = new Map<string, Set<string>>();
  for (const e of events ?? []) {
    views.set(e.site_id, (views.get(e.site_id) ?? 0) + 1);
    (visitors.get(e.site_id) ?? visitors.set(e.site_id, new Set()).get(e.site_id)!).add(e.visitor);
  }
  const list = sites ?? [];
  return (
    <div>
      <PageHeader title="Sites Internet connectés" subtitle="Sites existants des entreprises, reliés à leur mini-logiciel par le code de suivi MiniSoft." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Sites enregistrés" value={list.length} />
        <Tile label="Connectés" value={list.filter((s) => s.status === "connected").length} hint="au moins une visite reçue" />
        <Tile label="En attente du code" value={list.filter((s) => s.status === "pending").length} tone={list.some((s) => s.status === "pending") ? "warn" : "default"} />
        <Tile label="Pages vues (30 j)" value={(events ?? []).length.toLocaleString("fr-FR")} />
      </div>
      <Card>
        {list.length === 0 ? (
          <Empty>Aucun site connecté pour le moment. Les entreprises connectent leur site depuis l&apos;onglet « Site Internet » de leur logiciel.</Empty>
        ) : (
          <Table head={["Site", "Logiciel", "Statut", "Visiteurs (30 j)", "Pages vues (30 j)", "Dernière visite"]}>
            {list.map((s) => {
              const st = STATUS[s.status] ?? STATUS.pending!;
              const p = project(s.project_id);
              return (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3 py-2"><a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline">{s.host}</a>{s.last_error && <span className="block text-xs text-red-700">{s.last_error}</span>}</td>
                  <td className="px-3 py-2">{p ? <Link href={`/admin/logiciels/${p.id}`} className="hover:underline">{p.name}</Link> : "—"}<span className="block text-xs text-slate-500">{p?.sector}</span></td>
                  <td className="px-3 py-2"><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td className="px-3 py-2 tabular-nums">{(visitors.get(s.id)?.size ?? 0).toLocaleString("fr-FR")}</td>
                  <td className="px-3 py-2 tabular-nums">{(views.get(s.id) ?? 0).toLocaleString("fr-FR")}</td>
                  <td className="px-3 py-2 text-slate-600">{s.last_event_at ? fmtDateTime(s.last_event_at) : "Aucune"}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
