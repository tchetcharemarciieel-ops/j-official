import { aiConfig, refreshAiSettings } from "@/lib/ai";
import { PageHeader } from "@/components/admin/ui";
import { AgentsChat } from "@/components/admin/AgentsChat";

export const metadata = { title: "Assistant" };


/** Assistant du propriétaire : diagnostic, conception, contrôle qualité et développement commercial. */
export default async function AdminAssistant() {
  await refreshAiSettings();
  const cfg = aiConfig();
  return (
    <div>
      <PageHeader title="Agents MiniSoft RCA" subtitle="Quatre agents spécialisés : Diagnostic, Conception, Qualité et Commercial. Ils conseillent et rédigent des brouillons ; vous validez toute action." />
      {!cfg && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Aucun fournisseur IA n&apos;est configuré : l&apos;assistant ne pourra pas répondre. Réglez-le dans Intelligence artificielle.</p>}
      <AgentsChat note={`Réponses générées par l'IA${cfg ? ` (${cfg.label} · ${cfg.model})` : ""} : vérifiez-les avant usage. Chaque agent garde sa propre conversation dans ce navigateur. Aucun crédit n'est décompté pour le propriétaire.`} />
    </div>
  );
}
