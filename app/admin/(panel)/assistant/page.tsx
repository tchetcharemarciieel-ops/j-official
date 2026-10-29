import { aiConfig, refreshAiSettings } from "@/lib/ai";
import { PageHeader } from "@/components/admin/ui";
import { AssistantChat } from "@/components/assistant/AssistantChat";

export const metadata = { title: "Assistant" };

const STARTERS = [
  "Diagnostic : un restaurant de 20 places à Bangui qui perd des commandes et ne sait pas ce qui est payé.",
  "Conçois un mini-logiciel pour une pharmacie : stock, dates de péremption, ventes du jour.",
  "Prépare une offre simple et honnête pour les garages de Bangui, puis un message WhatsApp de prospection.",
  "Liste les scénarios de test du module caisse d'un restaurant (paiements, erreurs, permissions).",
  "Donne-moi 10 idées de vidéos TikTok pour présenter MiniSoft RCA, sans faux témoignages.",
  "Propose un tableau simple de suivi des prospects (colonnes, étapes, relances).",
];

/** Assistant du propriétaire : diagnostic, conception, contrôle qualité et développement commercial. */
export default async function AdminAssistant() {
  await refreshAiSettings();
  const cfg = aiConfig();
  return (
    <div>
      <PageHeader title="MiniSoft RCA Assistant" subtitle="Diagnostic d'entreprise, conception de mini-logiciels, contrôle qualité et développement commercial." />
      {!cfg && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Aucun fournisseur IA n&apos;est configuré : l&apos;assistant ne pourra pas répondre. Réglez-le dans Intelligence artificielle.</p>}
      <AssistantChat
        endpoint="/api/admin/assistant"
        storageKey="msassistant:admin"
        intro="Présentez une entreprise, un problème ou une tâche commerciale. L'assistant pose des questions si nécessaire, puis répond en 7 rubriques : résultat recherché, problème, solution, étapes, code ou message prêt à l'emploi, tests et risques, prochaine action. Il prépare des brouillons : c'est vous qui validez, publiez et contactez."
        starters={STARTERS}
        note={`Réponses générées par l'IA${cfg ? ` (${cfg.label} · ${cfg.model})` : ""} : vérifiez-les avant usage. La conversation reste dans ce navigateur. Aucun crédit n'est décompté pour le propriétaire.`}
      />
    </div>
  );
}
