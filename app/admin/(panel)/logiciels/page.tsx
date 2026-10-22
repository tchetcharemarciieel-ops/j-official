import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { STATUS, fmtDate } from "@/lib/status";
import { Badge, Card, Empty, PageHeader, Table } from "@/components/admin/ui";
import { Filters } from "@/components/admin/Filters";

export const metadata = { title: "Mini-logiciels" };

const TONE: Record<string, "green" | "amber" | "red" | "blue" | "slate"> = { published: "green", suspended: "red", failed: "red", test: "blue", generation: "amber", preparation: "slate" };

export default async function Projects({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string; secteur?: string }> }) {
  const { q = "", statut = "", secteur = "" } = await searchParams;
  const db = adminClient();
  const [{ data: projects }, { data: owners }] = await Promise.all([
    db.from("projects").select("id,name,slug,sector,status,owner_id,created_at,draft_version,published_version,last_error").order("created_at", { ascending: false }).limit(5000),
    db.from("profiles").select("id,email,company_name").limit(10000),
  ]);
  const ownerOf = (id: string) => owners?.find((o) => o.id === id);
  const needle = q.trim().toLowerCase();
  const sectors = [...new Set((projects ?? []).map((p) => p.sector).filter(Boolean))].sort();
  const list = (projects ?? []).filter(
    (p) =>
      (!needle || [p.name, p.slug, p.id, ownerOf(p.owner_id)?.email, ownerOf(p.owner_id)?.company_name].some((x) => String(x ?? "").toLowerCase().includes(needle))) &&
      (!statut || p.status === statut) &&
      (!secteur || p.sector === secteur),
  );
  return (
    <div>
      <PageHeader title="Mini-logiciels" subtitle={`${list.length} logiciel(s) affiché(s) sur ${projects?.length ?? 0}`} />
      <Card>
        <Filters
          q={q}
          placeholder="Nom, adresse, propriétaire…"
          selects={[
            { name: "statut", value: statut, label: "Statut", options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) },
            { name: "secteur", value: secteur, label: "Secteur", options: sectors.map((s) => ({ value: s, label: s })) },
          ]}
        />
        {list.length === 0 ? (
          <Empty>Aucun logiciel ne correspond.</Empty>
        ) : (
          <Table head={["Logiciel", "Propriétaire", "Créé le", "Statut", "Versions", ""]}>
            {list.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="px-3 py-2.5"><span className="block font-medium">{p.name}</span><span className="block text-xs text-slate-500">{p.sector} · /apps/{p.slug}</span></td>
                <td className="px-3 py-2.5 text-slate-600">{ownerOf(p.owner_id)?.email ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-600">{fmtDate(p.created_at)}</td>
                <td className="px-3 py-2.5"><Badge tone={TONE[p.status] ?? "slate"}>{STATUS[p.status]?.label ?? p.status}</Badge>{p.last_error && <span className="mt-1 block max-w-56 truncate text-xs text-red-700" title={p.last_error}>{p.last_error}</span>}</td>
                <td className="px-3 py-2.5 text-xs text-slate-600">brouillon v{p.draft_version}<br />{p.published_version ? `en ligne v${p.published_version}` : "non publié"}</td>
                <td className="px-3 py-2.5 text-right"><Link href={`/admin/logiciels/${p.id}`} className="text-blue-700 hover:underline">Gérer</Link></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
