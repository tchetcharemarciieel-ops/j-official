import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { ownerEmails } from "@/lib/admin";
import { encryptionAvailable } from "@/lib/crypto";
import { fmtDateTime } from "@/lib/status";
import { Badge, Card, Empty, PageHeader, Table } from "@/components/admin/ui";

export const metadata = { title: "Activité et sécurité" };

const FILTERS = {
  admin: { label: "Actions administratives", match: (a: string) => a.startsWith("admin.") && a !== "admin.login" && a !== "admin.access_denied" },
  connexions: { label: "Connexions administrateur", match: (a: string) => a === "admin.login" },
  refus: { label: "Accès refusés", match: (a: string) => a === "admin.access_denied" },
  erreurs: { label: "Erreurs et alertes", match: (_a: string, level?: string) => level === "error" || level === "warning" },
} as const;

export default async function Activity({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const { vue = "" } = await searchParams;
  const db = adminClient();
  const [{ data: logs }, { data: users }, { count: backups }] = await Promise.all([
    db.from("audit_logs").select("action,level,details,actor_id,project_id,created_at").order("created_at", { ascending: false }).limit(1000),
    db.from("profiles").select("id,email").limit(10000),
    db.from("backups").select("id", { count: "exact", head: true }),
  ]);
  const f = FILTERS[vue as keyof typeof FILTERS];
  const list = (logs ?? []).filter((l) => !f || f.match(l.action, l.level)).slice(0, 300);
  const email = (id: string | null) => (id ? users?.find((u) => u.id === id)?.email ?? id.slice(0, 8) : "système");
  const lastLogin = (logs ?? []).find((l) => l.action === "admin.login");

  return (
    <div className="space-y-4">
      <PageHeader title="Activité et sécurité" subtitle="Journal des actions, connexions administrateur, sauvegardes et protections en place." actions={<a href="/api/admin/backup" className="btn btn-primary">Télécharger une sauvegarde</a>} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Protections de l'administration">
          <ul className="space-y-2 text-sm">
            <li><Badge tone="green">actif</Badge> Accès réservé aux comptes de ADMIN_EMAILS ({ownerEmails().length} compte(s)) ; tout autre compte reçoit « page introuvable » et la tentative est journalisée.</li>
            <li><Badge tone="green">actif</Badge> Double authentification obligatoire (mot de passe + code à 6 chiffres) pour chaque page et chaque action.</li>
            <li><Badge tone="green">actif</Badge> Chaque opération sensible est revérifiée par le serveur et journalisée ; suppressions et suspensions demandent une confirmation.</li>
            <li><Badge tone={encryptionAvailable() ? "green" : "amber"}>{encryptionAvailable() ? "actif" : "à configurer"}</Badge> Chiffrement des clés API (APP_ENCRYPTION_KEY).</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">Dernière connexion administrateur : {lastLogin ? `${fmtDateTime(lastLogin.created_at)} (${String((lastLogin.details as { ip?: string })?.ip ?? "") || "adresse inconnue"})` : "—"}</p>
        </Card>
        <Card title="Sauvegardes et restauration">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            <li><strong>Sauvegarde de la plateforme</strong> : le bouton ci-dessus télécharge toutes les tables au format JSON (sans les clés API). À faire avant toute opération importante.</li>
            <li><strong>Sauvegardes par logiciel</strong> : {backups ?? 0} sauvegarde(s) de données, créées automatiquement avant chaque changement important et restaurables par le propriétaire du logiciel.</li>
            <li><strong>Versions</strong> : chaque logiciel garde l&apos;historique de sa structure ; restauration depuis <Link href="/admin/logiciels" className="text-blue-700 hover:underline">Mini-logiciels</Link>.</li>
            <li><strong>Base complète</strong> : restauration d&apos;une sauvegarde de la base depuis le tableau de bord Supabase (Database › Backups), selon votre formule Supabase.</li>
          </ul>
        </Card>
      </div>

      <Card title="Journal" actions={
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Filtrer le journal">
          <Link href="/admin/activite" className={`rounded-lg px-2.5 py-1 ${!f ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>Tout</Link>
          {Object.entries(FILTERS).map(([k, v]) => <Link key={k} href={`/admin/activite?vue=${k}`} className={`rounded-lg px-2.5 py-1 ${vue === k ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>{v.label}</Link>)}
        </nav>
      }>
        {list.length === 0 ? <Empty>Aucun évènement.</Empty> : (
          <Table head={["Date", "Évènement", "Par", "Détail"]}>
            {list.map((l, i) => (
              <tr key={i} className={l.level === "error" ? "text-red-700" : l.level === "warning" ? "text-amber-800" : ""}>
                <td className="whitespace-nowrap px-3 py-1.5 text-xs">{fmtDateTime(l.created_at)}</td>
                <td className="px-3 py-1.5 text-xs">{l.action}{l.project_id && <Link href={`/admin/logiciels/${l.project_id}`} className="ml-1 text-blue-700 hover:underline">logiciel</Link>}</td>
                <td className="px-3 py-1.5 text-xs">{email(l.actor_id)}</td>
                <td className="max-w-80 truncate px-3 py-1.5 text-xs text-slate-500" title={JSON.stringify(l.details)}>{JSON.stringify(l.details).slice(0, 140)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
