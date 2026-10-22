import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { isPlatformOwner } from "@/lib/admin";
import { fmtDate } from "@/lib/status";
import { Badge, Card, Empty, PageHeader, Table } from "@/components/admin/ui";
import { Filters } from "@/components/admin/Filters";

export const metadata = { title: "Utilisateurs" };

type Search = Promise<{ q?: string; statut?: string; formule?: string }>;

export default async function Users({ searchParams }: { searchParams: Search }) {
  const { q = "", statut = "", formule = "" } = await searchParams;
  const db = adminClient();
  const [{ data: users }, { data: projects }, { data: subs }, { data: plans }] = await Promise.all([
    db.from("profiles").select("id,email,full_name,plan,credits,suspended,created_at,company_name").order("created_at", { ascending: false }).limit(2000),
    db.from("projects").select("owner_id").limit(10000),
    db.from("subscriptions").select("user_id,status,source,ends_at").eq("status", "active").limit(10000),
    db.from("plans").select("id,name").order("sort"),
  ]);
  const needle = q.trim().toLowerCase();
  const list = (users ?? []).filter(
    (u) =>
      (!needle || [u.email, u.full_name, u.id, u.company_name].some((x) => String(x ?? "").toLowerCase().includes(needle))) &&
      (!statut || (statut === "suspendu" ? u.suspended : !u.suspended)) &&
      (!formule || u.plan === formule),
  );
  const planName = (id: string) => plans?.find((p) => p.id === id)?.name ?? id;
  return (
    <div>
      <PageHeader title="Utilisateurs" subtitle={`${list.length} compte(s) affiché(s) sur ${users?.length ?? 0}`} />
      <Card>
        <Filters
          q={q}
          placeholder="Nom, e-mail, identifiant, entreprise…"
          selects={[
            { name: "statut", value: statut, label: "Statut", options: [{ value: "actif", label: "Actifs" }, { value: "suspendu", label: "Suspendus" }] },
            { name: "formule", value: formule, label: "Formule", options: (plans ?? []).map((p) => ({ value: p.id, label: p.name })) },
          ]}
        />
        {list.length === 0 ? (
          <Empty>Aucun utilisateur ne correspond.</Empty>
        ) : (
          <Table head={["Utilisateur", "Inscription", "Formule", "Abonnement", "Logiciels", "Statut", ""]}>
            {list.map((u) => {
              const sub = subs?.find((s) => s.user_id === u.id);
              return (
                <tr key={u.id} className="align-top">
                  <td className="px-3 py-2.5">
                    <span className="block font-medium">{u.full_name || "—"}{isPlatformOwner(u) && <Badge tone="blue">propriétaire</Badge>}</span>
                    <span className="block text-xs text-slate-500">{u.email}</span>
                    {u.company_name && <span className="block text-xs text-slate-500">{u.company_name}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{fmtDate(u.created_at)}</td>
                  <td className="px-3 py-2.5">{planName(u.plan)}<span className="block text-xs text-slate-500">{u.credits} crédits</span></td>
                  <td className="px-3 py-2.5">{sub ? <Badge tone="green">actif ({sub.source})</Badge> : <Badge>aucun</Badge>}</td>
                  <td className="px-3 py-2.5">{(projects ?? []).filter((p) => p.owner_id === u.id).length}</td>
                  <td className="px-3 py-2.5">{u.suspended ? <Badge tone="red">suspendu</Badge> : <Badge tone="green">actif</Badge>}</td>
                  <td className="px-3 py-2.5 text-right"><Link href={`/admin/utilisateurs/${u.id}`} className="text-blue-700 hover:underline">Gérer</Link></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
