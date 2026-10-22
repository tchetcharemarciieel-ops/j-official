import Link from "next/link";
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { isPlatformOwner } from "@/lib/admin";
import { STATUS, fmtDate, fmtDateTime } from "@/lib/status";
import { ROLE_LABELS, type Role } from "@/lib/spec";
import { Badge, Card, Empty, PageHeader, Table, fmtXaf } from "@/components/admin/ui";
import { Action } from "@/components/admin/Action";
import { MemberRole, PlanCredits } from "@/components/admin/Controls";

export const metadata = { title: "Utilisateur" };

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = adminClient();
  const { data: u } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!u) notFound();
  const [{ data: memberships }, { data: subs }, { data: pays }, { data: plans }, { data: usage }] = await Promise.all([
    db.from("project_members").select("project_id,role,created_at").eq("user_id", id),
    db.from("subscriptions").select("plan_id,status,source,started_at,ends_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("payments").select("provider,amount_xaf,status,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("plans").select("id,name").order("sort"),
    db.from("ai_usage").select("status,engine").eq("user_id", id).limit(5000),
  ]);
  const ids = (memberships ?? []).map((m) => m.project_id);
  const { data: projects } = ids.length ? await db.from("projects").select("id,name,slug,status,created_at,owner_id").in("id", ids) : { data: [] };
  const owner = isPlatformOwner(u);
  const activeSub = subs?.find((s) => s.status === "active");

  return (
    <div className="space-y-4">
      <PageHeader
        title={u.full_name || u.email}
        subtitle={`${u.email} · inscrit le ${fmtDate(u.created_at)} · identifiant ${u.id}`}
        actions={<Link href="/admin/utilisateurs" className="btn btn-ghost">Retour à la liste</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Compte">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">Statut</dt>
            <dd>{u.suspended ? <Badge tone="red">suspendu</Badge> : <Badge tone="green">actif</Badge>}{u.suspended_reason && <span className="block text-xs text-slate-500">{u.suspended_reason}</span>}</dd>
            <dt className="text-slate-500">Rôle plateforme</dt>
            <dd>{owner ? "Propriétaire (ADMIN_EMAILS)" : "Client"}</dd>
            <dt className="text-slate-500">Entreprise</dt>
            <dd>{u.company_name || "—"}{u.company_sector ? ` · ${u.company_sector}` : ""}</dd>
            <dt className="text-slate-500">Téléphone</dt>
            <dd>{u.company_phone || "—"}</dd>
            <dt className="text-slate-500">Abonnement</dt>
            <dd>{activeSub ? `${plans?.find((p) => p.id === activeSub.plan_id)?.name ?? activeSub.plan_id} (${activeSub.source})` : "aucun abonnement actif"}</dd>
            <dt className="text-slate-500">Utilisation IA</dt>
            <dd>{usage?.filter((x) => x.engine === "ai").length ?? 0} requête(s), {usage?.filter((x) => x.status !== "success").length ?? 0} échec(s)</dd>
          </dl>
          {!owner && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {u.suspended ? (
                <Action url={`/api/admin/users/${u.id}`} method="PATCH" body={{ suspended: false }} label="Réactiver le compte" confirm="Le compte pourra de nouveau se connecter et utiliser ses logiciels." done="Compte réactivé." />
              ) : (
                <Action url={`/api/admin/users/${u.id}`} method="PATCH" body={{ suspended: true, reason: "Suspendu par l'administration" }} label="Suspendre le compte" confirm="L'utilisateur ne pourra plus se connecter. Ses données sont conservées." danger done="Compte suspendu." />
              )}
              <Action url={`/api/admin/users/${u.id}`} method="DELETE" body={{ confirm: u.email }} label="Supprimer le compte" confirm="Suppression définitive du compte et des logiciels dont il est propriétaire. Exportez les données avant si nécessaire." confirmText={u.email} danger done="Compte supprimé." />
            </div>
          )}
        </Card>
        <Card title="Formule et crédits" subtitle="Un changement de formule est enregistré dans l'historique des abonnements (attribution manuelle, sans paiement).">
          <PlanCredits userId={u.id} plan={u.plan} credits={u.credits} plans={plans ?? []} />
        </Card>
      </div>

      <Card title="Logiciels et rôles">
        {(projects ?? []).length === 0 ? (
          <Empty>Aucun logiciel.</Empty>
        ) : (
          <Table head={["Logiciel", "Statut", "Créé le", "Rôle"]}>
            {(projects ?? []).map((p) => {
              const role = memberships!.find((m) => m.project_id === p.id)!.role as Role;
              return (
                <tr key={p.id}>
                  <td className="px-3 py-2.5"><Link href={`/admin/logiciels/${p.id}`} className="text-blue-700 hover:underline">{p.name}</Link></td>
                  <td className="px-3 py-2.5">{STATUS[p.status]?.label ?? p.status}</td>
                  <td className="px-3 py-2.5">{fmtDate(p.created_at)}</td>
                  <td className="px-3 py-2.5"><span className="sr-only">{ROLE_LABELS[role]}</span><MemberRole projectId={p.id} userId={u.id} role={role} /></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Historique des abonnements">
          {(subs ?? []).length === 0 ? <Empty>Aucun abonnement enregistré.</Empty> : (
            <ul className="space-y-1.5 text-sm">
              {subs!.map((s, i) => <li key={i}>{plans?.find((p) => p.id === s.plan_id)?.name ?? s.plan_id} · <Badge tone={s.status === "active" ? "green" : "slate"}>{s.status}</Badge> · {s.source} · depuis le {fmtDate(s.started_at)}{s.ends_at ? ` jusqu'au ${fmtDate(s.ends_at)}` : ""}</li>)}
            </ul>
          )}
        </Card>
        <Card title="Paiements">
          {(pays ?? []).length === 0 ? <Empty>Aucun paiement.</Empty> : (
            <ul className="space-y-1.5 text-sm">
              {pays!.map((p, i) => <li key={i}>{fmtDateTime(p.created_at)} · {fmtXaf(p.amount_xaf)} · {p.provider} · <Badge tone={p.status === "succeeded" ? "green" : p.status === "failed" ? "red" : "amber"}>{p.status}</Badge></li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
