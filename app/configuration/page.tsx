import { CircleCheck, CircleX } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { serverConfigured, supabaseConfigured } from "@/lib/config";
import { aiConfig, refreshAiSettings } from "@/lib/ai";

export const metadata = { title: "Configuration requise" };
export const dynamic = "force-dynamic";

function Row({ ok, label, help }: { ok: boolean; label: string; help: string }) {
  return (
    <li className="flex gap-3">
      {ok ? <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-label="Disponible" /> : <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-label="Manquant" />}
      <div>
        <p className="font-medium text-slate-900">{label}</p>
        {!ok && <p className="text-xs text-slate-600">{help}</p>}
      </div>
    </li>
  );
}

/** Page honnête : indique ce qui manque au lieu de simuler un fonctionnement. */
export default async function Page() {
  await refreshAiSettings();
  return (
    <AuthShell title="Configuration de la plateforme" subtitle="État des services nécessaires au fonctionnement de MiniSoft RCA.">
      <ul className="space-y-4 text-sm">
        <Row ok={supabaseConfigured()} label="Base de données et comptes (Supabase)" help="Ajoutez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans les variables d'environnement de l'hébergeur (Render)." />
        <Row ok={serverConfigured()} label="Accès serveur sécurisé" help="Ajoutez SUPABASE_SERVICE_ROLE_KEY dans Render › Environment (clé « secret » de Supabase, commence par sb_secret_)." />
        <Row ok={aiConfig() !== null} label={aiConfig() ? `Fournisseur IA : clé présente (${aiConfig()!.label}, connexion testable dans l'administration)` : "Fournisseur IA (facultatif)"} help="Ajoutez AI_PROVIDER (gemini, openai ou anthropic) et la clé correspondante (GEMINI_API_KEY, OPENAI_API_KEY ou ANTHROPIC_API_KEY) dans Render › Environment. Sans clé, l'analyse passe par le système de secours et la plateforme l'indique clairement." />
        <Row ok={false} label="Paiement en ligne" help="Aucun prestataire de paiement n'est branché : aucune facturation n'est possible." />
      </ul>
    </AuthShell>
  );
}
