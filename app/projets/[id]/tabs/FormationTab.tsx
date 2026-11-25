import Link from "next/link";
import { Lock } from "lucide-react";
import { FormationView } from "@/components/formation/FormationView";
import type { WorkspaceData } from "../Workspace";

/** Onglet Formation : leçons du logiciel pour les formules Pro et plus ; verrouillé (sans contenu) sur Découverte. */
export function FormationTab({ data }: { data: WorkspaceData }) {
  if (!data.formation) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-amber-50 px-5 py-4">
        <p className="flex items-center gap-2 font-semibold text-slate-900"><Lock className="h-4 w-4" aria-hidden /> Formation réservée à la formule Pro et aux formules supérieures</p>
        <p className="mt-1 text-sm text-slate-700">Votre formule actuelle ({data.planName}) vous permet de découvrir MiniSoft RCA, sans accès aux leçons.</p>
        <Link href="/espace/abonnement" className="btn btn-primary mt-3">Voir les formules</Link>
      </div>
    );
  }
  return <FormationView modules={data.formation} />;
}
