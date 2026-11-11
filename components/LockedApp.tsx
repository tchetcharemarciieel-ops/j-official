"use client";

import Link from "next/link";
import { Check, Lock, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppSpec } from "@/lib/spec";
import { AppRuntime } from "@/components/runtime/AppRuntime";

/**
 * Logiciel généré mais verrouillé (formule gratuite) : l'aperçu du vrai logiciel est flouté et
 * inactif ; le propriétaire le débloque en choisissant une formule. Rien n'est inventé : pas de
 * compte à rebours, pas de fausse réduction, pas de faux nombre d'utilisateurs.
 */
export function LockedApp({ spec, projectId, owner, projectName }: { spec: AppSpec | null; projectId: string; owner: boolean; projectName: string }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setP((x) => (x >= 100 ? 100 : x + 4)), 40);
    return () => clearInterval(t);
  }, []);
  const steps = ["Activité comprise", "Fonctions choisies", "Logiciel généré", "Résultat prêt"];
  return (
    <div className="relative min-h-[80dvh] overflow-hidden rounded-3xl bg-[#0B1B3F]">
      {spec && (
        <div aria-hidden className="pointer-events-none absolute inset-0 scale-105 select-none blur-[10px] brightness-75" inert>
          <AppRuntime projectId={`apercu-${projectId}`} spec={spec} mode="local" role="owner" compact />
        </div>
      )}
      <div className="relative z-10 flex min-h-[80dvh] flex-col items-center justify-center gap-5 px-4 py-10 text-center text-white">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Votre logiciel est prêt… mais verrouillé</h1>
          <p className="mt-2 text-sm text-white/80">« {projectName} » a été généré. {owner ? "Débloquez-le pour l'utiliser avec votre équipe et vos clients." : "Son propriétaire doit le débloquer pour que vous puissiez l'utiliser."}</p>
        </div>
        <span className="grid h-20 w-20 place-items-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur"><Lock className="h-9 w-9" aria-hidden /></span>
        {owner && (
          <Link href={`/espace/abonnement?logiciel=${projectId}`} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#2563EB] px-8 py-3 text-base font-bold shadow-lg shadow-blue-950/40 ring-2 ring-[#FACC15]/70 hover:bg-[#1D4ED8]">
            <Sparkles className="h-5 w-5" aria-hidden />Débloquer mon logiciel
          </Link>
        )}
        <div className="w-full max-w-sm rounded-2xl bg-slate-950/70 p-5 text-left ring-1 ring-white/10 backdrop-blur">
          <p className="mb-3 text-center text-sm font-semibold">Génération prête</p>
          <ul className="space-y-2 text-sm">
            {steps.map((s) => <li key={s} className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-[#FACC15] text-[#0B1B3F]"><Check className="h-3.5 w-3.5" aria-hidden /></span>{s}</li>)}
          </ul>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#38BDF8] transition-[width] duration-100" style={{ width: `${p}%` }} /></div>
          <p className="mt-1 text-right text-[11px] text-white/60">{p} %</p>
        </div>
        {owner && <p className="max-w-sm text-xs text-white/60">Vos réponses et votre plan sont conservés : dès que votre formule est active, le logiciel s&apos;ouvre tel quel.</p>}
      </div>
    </div>
  );
}
