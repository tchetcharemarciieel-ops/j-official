import { requireProfile } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/config";
import { aiConfig, refreshAiSettings } from "@/lib/ai";
import { AssistantChat } from "@/components/assistant/AssistantChat";

export const metadata = { title: "Assistant" };
export const dynamic = "force-dynamic";

const STARTERS = [
  "J'ai un restaurant et je perds des commandes.",
  "Mon garage n'arrive pas à suivre les réparations et les paiements.",
  "Je tiens une boutique : je ne sais jamais ce qui reste en stock.",
  "Je ne sais pas par où commencer : aidez-moi à trouver mes problèmes.",
];

/** Assistant de l'espace client : il aide le dirigeant à concevoir son mini-logiciel. */
export default async function ClientAssistant() {
  const profile = await requireProfile("/espace/assistant");
  await refreshAiSettings();
  const available = Boolean(aiConfig());
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Assistant</h1>
        <p className="text-sm text-slate-600">Décrivez votre activité : l&apos;assistant vous pose quelques questions, repère vos problèmes prioritaires et vous propose le mini-logiciel adapté.</p>
      </div>
      {!available && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">L&apos;assistant IA n&apos;est pas disponible pour le moment. Vous pouvez décrire votre besoin directement dans « Créer un logiciel ».</p>}
      <AssistantChat
        endpoint="/api/assistant"
        storageKey={`msassistant:${profile.id}`}
        client
        intro="Bonjour ! Parlez-moi de votre entreprise : votre métier, votre équipe et ce qui vous fait perdre du temps, de l'argent ou des clients."
        starters={STARTERS}
        note={`Chaque réponse utilise ${CREDIT_COSTS.ask} crédit IA (vous en avez ${profile.credits}). Les conseils sont générés par l'IA : vérifiez-les. La conversation reste sur cet appareil.`}
      />
    </div>
  );
}
