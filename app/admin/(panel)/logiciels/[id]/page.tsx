import Link from "next/link";
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/config";
import { STATUS, fmtDate, fmtDateTime } from "@/lib/status";
import { parseSpec, ROLE_LABELS, type Role } from "@/lib/spec";
import { effectiveWorkspace, LAYOUT_LABELS } from "@/lib/workspace";
import { Badge, Card, Empty, PageHeader, Table } from "@/components/admin/ui";
import { Action } from "@/components/admin/Action";

export const metadata = { title: "Mini-logiciel" };

type Report = { summary?: { total: number; passed: number; warnings: number; failed: number } } | null;

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = adminClient();
  const { data: p } = await db.from("projects").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: owner }, { data: versions }, { data: members }, { data: logs }, { count: records }] = await Promise.all([
    db.from("profiles").select("id,email,company_name").eq("id", p.owner_id).maybeSingle(),
    db.from("project_versions").select("version,summary,source,published,created_at,test_report").eq("project_id", id).order("version", { ascending: false }).limit(30),
    db.from("project_members").select("user_id,role").eq("project_id", id),
    db.from("audit_logs").select("action,level,details,created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("records").select("id", { count: "exact", head: true }).eq("project_id", id).eq("is_demo", false),
  ]);
  const parsed = parseSpec(p.draft_spec);
  const spec = parsed.ok ? parsed.spec : null;
  const ws = spec ? effectiveWorkspace(spec) : null;
  const latestReport = (versions?.[0]?.test_report ?? null) as Report;
  const url = `${SITE_URL}/apps/${p.slug}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={p.name}
        subtitle={`${p.sector} · propriétaire ${owner?.email ?? "—"} · créé le ${fmtDate(p.created_at)}`}
        actions={
          <>
            <Link href="/admin/logiciels" className="btn btn-ghost">Retour</Link>
            {p.published_spec && p.status === "published" && <a href={url} target="_blank" rel="noopener" className="btn btn-ghost">Ouvrir le lien public</a>}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="État et déploiement">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">Statut</dt>
            <dd><Badge tone={p.status === "published" ? "green" : p.status === "suspended" || p.status === "failed" ? "red" : "blue"}>{STATUS[p.status]?.label ?? p.status}</Badge></dd>
            <dt className="text-slate-500">Brouillon</dt>
            <dd>v{p.draft_version}</dd>
            <dt className="text-slate-500">En ligne</dt>
            <dd>{p.published_version ? `v${p.published_version} depuis le ${fmtDateTime(p.published_at)}` : "non publié"}</dd>
            <dt className="text-slate-500">Derniers tests</dt>
            <dd>{latestReport?.summary ? `${latestReport.summary.passed}/${latestReport.summary.total} réussis${latestReport.summary.failed ? `, ${latestReport.summary.failed} en échec` : ""}` : "—"}</dd>
            <dt className="text-slate-500">Fiches réelles</dt>
            <dd>{records ?? 0}</dd>
          </dl>
          {p.last_error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{p.last_error}</p>}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {spec && <Action url={`/api/admin/projects/${p.id}`} method="PATCH" body={{ action: "publish" }} label={p.published_version ? "Republier le brouillon" : "Publier"} confirm={`La version v${p.draft_version} sera mise en ligne si ses tests réussissent.`} done="Logiciel publié." />}
            {p.published_spec && <Action url={`/api/admin/projects/${p.id}`} method="PATCH" body={{ action: "unpublish" }} label="Dépublier" confirm="Le lien public ne sera plus accessible. Le brouillon et les données sont conservés." danger done="Publication retirée." />}
            {p.status === "published" && <Action url={`/api/admin/projects/${p.id}`} method="PATCH" body={{ action: "suspend", reason: "Décision de l'administration" }} label="Suspendre" confirm="Les membres n'auront plus accès au logiciel (sauf propriétaire et administrateurs). Les données sont conservées." danger done="Logiciel suspendu." />}
            {p.status === "suspended" && p.published_spec && <Action url={`/api/admin/projects/${p.id}`} method="PATCH" body={{ action: "resume" }} label="Réactiver" done="Logiciel réactivé." />}
          </div>
        </Card>

        <Card title="Aperçu du logiciel" className="lg:col-span-2">
          {!spec ? (
            <Empty>Aucune version valide.</Empty>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">{spec.description || spec.welcome || "—"}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {spec.entities.map((e) => (
                  <div key={e.key} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-medium">{e.labelPlural}</p>
                    <p className="mt-1 text-xs text-slate-500">{e.fields.map((f) => f.label).join(", ")}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Tableau de bord : {spec.dashboard.map((w) => w.label).join(", ") || "—"}
                {ws && <> · Espace 3D : {ws.enabled ? `${LAYOUT_LABELS[ws.layout]}, ${ws.stations.length} poste(s)` : "désactivé"}</>}
              </p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Versions" subtitle="Restaurer crée une nouvelle version testée ; les données ne sont jamais effacées.">
          {(versions ?? []).length === 0 ? <Empty>Aucune version.</Empty> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {versions!.map((v) => (
                <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><strong>v{v.version}</strong> · {fmtDateTime(v.created_at)} · {v.source}{v.published && <Badge tone="green">publiée</Badge>}<span className="block text-xs text-slate-500">{v.summary}</span></span>
                  {v.version !== p.draft_version && <Action url={`/api/admin/projects/${p.id}`} method="PATCH" body={{ action: "restore", version: v.version }} label="Restaurer" confirm={`La structure de la version v${v.version} deviendra un nouveau brouillon (à republier ensuite).`} done="Version restaurée." />}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card title="Membres">
            <ul className="space-y-1 text-sm">
              {(members ?? []).map((m) => <li key={m.user_id}><Link href={`/admin/utilisateurs/${m.user_id}`} className="text-blue-700 hover:underline">{m.user_id === owner?.id ? owner?.email : m.user_id.slice(0, 8)}</Link> · {ROLE_LABELS[m.role as Role] ?? m.role}</li>)}
            </ul>
          </Card>
          <Card title="Journal et erreurs">
            {(logs ?? []).length === 0 ? <Empty>Aucun évènement.</Empty> : (
              <Table head={["Date", "Évènement", "Détail"]}>
                {logs!.map((l, i) => (
                  <tr key={i} className={l.level === "error" ? "text-red-700" : l.level === "warning" ? "text-amber-800" : ""}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs">{fmtDateTime(l.created_at)}</td>
                    <td className="px-3 py-1.5 text-xs">{l.action}</td>
                    <td className="max-w-64 truncate px-3 py-1.5 text-xs text-slate-500" title={JSON.stringify(l.details)}>{JSON.stringify(l.details).slice(0, 120)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
