import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { fmtDateTime } from "@/lib/status";
import { Badge, Card, Empty, PageHeader, Table } from "@/components/admin/ui";
import { Filters } from "@/components/admin/Filters";
import { AdminLeads } from "../AdminTables";

export const metadata = { title: "Support" };

const TICKET_STATUS = { nouveau: ["Nouveau", "red"], en_cours: ["En cours", "amber"], resolu: ["Résolu", "green"] } as const;
const CATEGORY: Record<string, string> = { assistance: "Assistance", probleme: "Problème signalé", suggestion: "Suggestion" };

export default async function Support({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string; type?: string }> }) {
  const { q = "", statut = "", type = "" } = await searchParams;
  const db = adminClient();
  const [{ data: tickets }, { data: leads }] = await Promise.all([
    db.from("support_tickets").select("id,email,name,category,subject,status,created_at,updated_at").order("created_at", { ascending: false }).limit(2000),
    db.from("leads").select("id,name,company,sector,phone,email,message,source,status,created_at").order("created_at", { ascending: false }).limit(200),
  ]);
  const needle = q.trim().toLowerCase();
  const list = (tickets ?? []).filter((t) => (!needle || [t.subject, t.email, t.name].some((x) => String(x ?? "").toLowerCase().includes(needle))) && (!statut || t.status === statut) && (!type || t.category === type));
  return (
    <div className="space-y-4">
      <PageHeader title="Support" subtitle="Demandes d'assistance, problèmes signalés, suggestions et demandes de démonstration." />
      <Card title={`Demandes des clients (${list.length})`}>
        <Filters
          q={q}
          placeholder="Sujet, e-mail, nom…"
          selects={[
            { name: "statut", value: statut, label: "Statut", options: Object.entries(TICKET_STATUS).map(([value, [label]]) => ({ value, label })) },
            { name: "type", value: type, label: "Type", options: Object.entries(CATEGORY).map(([value, label]) => ({ value, label })) },
          ]}
        />
        {list.length === 0 ? <Empty>Aucune demande.</Empty> : (
          <Table head={["Reçue le", "Client", "Type", "Sujet", "Statut", ""]}>
            {list.map((t) => {
              const [label, tone] = TICKET_STATUS[t.status as keyof typeof TICKET_STATUS] ?? [t.status, "slate"];
              return (
                <tr key={t.id}>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDateTime(t.created_at)}</td>
                  <td className="px-3 py-2">{t.name || "—"}<span className="block text-xs text-slate-500">{t.email}</span></td>
                  <td className="px-3 py-2">{CATEGORY[t.category] ?? t.category}</td>
                  <td className="px-3 py-2">{t.subject}</td>
                  <td className="px-3 py-2"><Badge tone={tone}>{label}</Badge></td>
                  <td className="px-3 py-2 text-right"><Link href={`/admin/support/${t.id}`} className="text-blue-700 hover:underline">Ouvrir</Link></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <Card title={`Demandes de démonstration (${(leads ?? []).filter((l) => l.status === "nouveau").length} nouvelle(s))`}>
        <AdminLeads leads={(leads ?? []).map((l) => ({ ...l, created: fmtDateTime(l.created_at) }))} />
      </Card>
    </div>
  );
}
