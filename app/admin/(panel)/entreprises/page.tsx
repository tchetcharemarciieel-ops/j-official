import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { fmtDate } from "@/lib/status";
import { Card, Empty, PageHeader, Table } from "@/components/admin/ui";
import { Filters } from "@/components/admin/Filters";

export const metadata = { title: "Entreprises" };

/** Entreprises = comptes ayant renseigné leur profil d'entreprise (nom, secteur, coordonnées). */
export default async function Companies({ searchParams }: { searchParams: Promise<{ q?: string; secteur?: string }> }) {
  const { q = "", secteur = "" } = await searchParams;
  const db = adminClient();
  const [{ data: profiles }, { data: projects }] = await Promise.all([
    db.from("profiles").select("id,email,full_name,company_name,company_sector,company_phone,company_email,company_address,plan,created_at").neq("company_name", "").order("created_at", { ascending: false }).limit(5000),
    db.from("projects").select("owner_id,status").limit(10000),
  ]);
  const needle = q.trim().toLowerCase();
  const sectors = [...new Set((profiles ?? []).map((p) => p.company_sector).filter(Boolean))].sort();
  const list = (profiles ?? []).filter((p) => (!needle || [p.company_name, p.email, p.full_name, p.company_phone].some((x) => String(x ?? "").toLowerCase().includes(needle))) && (!secteur || p.company_sector === secteur));
  return (
    <div>
      <PageHeader title="Entreprises" subtitle={`${list.length} entreprise(s) avec un profil renseigné`} />
      <Card>
        <Filters q={q} placeholder="Entreprise, contact, téléphone…" selects={[{ name: "secteur", value: secteur, label: "Secteur", options: sectors.map((s) => ({ value: s, label: s })) }]} />
        {list.length === 0 ? (
          <Empty>Aucune entreprise ne correspond. Les entreprises apparaissent quand un client remplit son profil d&apos;entreprise.</Empty>
        ) : (
          <Table head={["Entreprise", "Contact", "Coordonnées", "Formule", "Logiciels", "Depuis"]}>
            {list.map((p) => {
              const own = (projects ?? []).filter((x) => x.owner_id === p.id);
              return (
                <tr key={p.id} className="align-top">
                  <td className="px-3 py-2.5"><span className="block font-medium">{p.company_name}</span><span className="text-xs text-slate-500">{p.company_sector || "—"}</span></td>
                  <td className="px-3 py-2.5"><Link href={`/admin/utilisateurs/${p.id}`} className="text-blue-700 hover:underline">{p.full_name || p.email}</Link><span className="block text-xs text-slate-500">{p.email}</span></td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{[p.company_phone, p.company_email, p.company_address].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-3 py-2.5">{p.plan}</td>
                  <td className="px-3 py-2.5">{own.length} <span className="text-xs text-slate-500">({own.filter((x) => x.status === "published").length} publié(s))</span></td>
                  <td className="px-3 py-2.5 text-slate-600">{fmtDate(p.created_at)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
