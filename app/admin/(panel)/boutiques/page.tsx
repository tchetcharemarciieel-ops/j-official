import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { fmtDate } from "@/lib/status";
import { Action } from "@/components/admin/Action";
import { Badge, Card, Empty, PageHeader, Table, Tile } from "@/components/admin/ui";

export const metadata = { title: "Boutiques MiniSoft Shop" };

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate" }> = { published: { label: "Publiée", tone: "green" }, suspended: { label: "Suspendue", tone: "red" }, draft: { label: "Brouillon", tone: "slate" }, generation: { label: "Brouillon", tone: "slate" }, failed: { label: "Erreur", tone: "red" } };

/**
 * Boutiques MiniSoft Shop : comptes de produits, de commandes et de membres (jamais le contenu
 * des clients, des ventes ou des prix). Suspension et réactivation tracées dans le journal.
 */
export default async function Boutiques() {
  const db = adminClient();
  const { data: all } = await db.from("projects").select("id,name,slug,status,owner_id,created_at,published_version,draft_spec").order("created_at", { ascending: false }).limit(5000);
  const shops = (all ?? []).filter((p) => (p.draft_spec as { module?: string } | null)?.module === "shop");
  const ids = shops.map((s) => s.id);
  const [owners, members, rows] = await Promise.all([
    shops.length ? db.from("profiles").select("id,full_name,email,plan").in("id", [...new Set(shops.map((s) => s.owner_id))]) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string; plan: string }[] }),
    ids.length ? db.from("project_members").select("project_id").in("project_id", ids).limit(20000) : Promise.resolve({ data: [] as { project_id: string }[] }),
    ids.length ? db.from("records").select("project_id,entity").in("project_id", ids).eq("is_demo", false).in("entity", ["sh:product", "sh:order", "sh:sale"]).limit(100000) : Promise.resolve({ data: [] as { project_id: string; entity: string }[] }),
  ]);
  const count = (pid: string, entity: string) => (rows.data ?? []).filter((r) => r.project_id === pid && r.entity === entity).length;
  const users = (pid: string) => (members.data ?? []).filter((m) => m.project_id === pid).length;
  const owner = (id: string) => owners.data?.find((o) => o.id === id);
  return (
    <div>
      <PageHeader title="Boutiques MiniSoft Shop" subtitle="Toutes les boutiques créées. Vous voyez les totaux, jamais le contenu des ventes ni les coordonnées des clients." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Boutiques" value={shops.length} />
        <Tile label="Publiées" value={shops.filter((s) => s.status === "published").length} />
        <Tile label="Suspendues" value={shops.filter((s) => s.status === "suspended").length} tone={shops.some((s) => s.status === "suspended") ? "warn" : "default"} />
        <Tile label="Commandes en ligne" value={(rows.data ?? []).filter((r) => r.entity === "sh:order").length.toLocaleString("fr-FR")} />
      </div>
      <Card>
        {shops.length === 0 ? (
          <Empty>Aucune boutique créée pour le moment. Les commerçants la créent depuis « Créer un mini-logiciel ».</Empty>
        ) : (
          <Table head={["Boutique", "Propriétaire", "Créée le", "Statut", "Produits", "Ventes", "Commandes", "Membres", ""]}>
            {shops.map((s) => {
              const st = STATUS[s.status] ?? STATUS.draft!;
              const o = owner(s.owner_id);
              return (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3 py-2"><Link href={`/admin/logiciels/${s.id}`} className="font-medium text-blue-700 hover:underline">{s.name}</Link><span className="block text-xs text-slate-500">/shop/{s.slug}</span></td>
                  <td className="px-3 py-2">{o?.full_name || o?.email || "—"}<span className="block text-xs text-slate-500">Formule : {o?.plan ?? "—"}</span></td>
                  <td className="px-3 py-2 text-slate-600">{fmtDate(s.created_at)}</td>
                  <td className="px-3 py-2"><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td className="px-3 py-2 tabular-nums">{count(s.id, "sh:product")}</td>
                  <td className="px-3 py-2 tabular-nums">{count(s.id, "sh:sale")}</td>
                  <td className="px-3 py-2 tabular-nums">{count(s.id, "sh:order")}</td>
                  <td className="px-3 py-2 tabular-nums">{users(s.id)}</td>
                  <td className="px-3 py-2">
                    {s.status === "published" && <Action url={`/api/admin/projects/${s.id}`} method="PATCH" body={{ action: "suspend", reason: "Décision de l'administration" }} label="Suspendre" confirm="La boutique en ligne et le logiciel sont fermés (le propriétaire garde l'accès). Les données sont conservées." danger done="Boutique suspendue." />}
                    {s.status === "suspended" && <Action url={`/api/admin/projects/${s.id}`} method="PATCH" body={{ action: "resume" }} label="Réactiver" done="Boutique réactivée." />}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
