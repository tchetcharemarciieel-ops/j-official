import { assistantEngine, refreshAiSettings } from "@/lib/ai";
import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { AgentsChat } from "@/components/admin/AgentsChat";

export const metadata = { title: "Assistant" };


/** Assistant du propriétaire : diagnostic, conception, contrôle qualité et développement commercial. */
export default async function AdminAssistant() {
  await refreshAiSettings();
  const cfg = assistantEngine();
  return (
    <div>
      <PageHeader title="Agents MiniSoft RCA" subtitle="Quatre agents spécialisés : Diagnostic, Conception, Qualité et Commercial. Ils conseillent et rédigent des brouillons ; vous validez toute action." />
      {cfg && !cfg.claude && (
        <p className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Les agents utilisent actuellement {cfg.label}. Pour qu&apos;ils fonctionnent avec <strong>Claude</strong>, enregistrez une clé API Anthropic dans <Link href="/admin/ia" className="font-semibold underline">Intelligence artificielle › Clés</Link> : ils l&apos;utiliseront automatiquement en priorité. Cette clé se crée sur console.anthropic.com ; son usage est payant, facturé par Anthropic.
        </p>
      )}
      {!cfg && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Aucun fournisseur IA n&apos;est configuré : l&apos;assistant ne pourra pas répondre. Réglez-le dans Intelligence artificielle.</p>}
      <AgentsChat note={`Réponses générées par l'IA${cfg ? ` (${cfg.label} · ${cfg.model})` : ""} : vérifiez-les avant usage. Chaque agent garde sa propre conversation dans ce navigateur. Aucun crédit n'est décompté pour le propriétaire.`} />
    </div>
  );
}
