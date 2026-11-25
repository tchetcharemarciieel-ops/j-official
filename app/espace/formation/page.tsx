import Link from "next/link";
import { GraduationCap, Lock } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { FORMATION, totalMinutes } from "@/lib/formation";

export const metadata = { title: "Formation" };
export const dynamic = "force-dynamic";

/** Formation : accessible avec une formule qui permet la publication (Pro et plus) ; la formule Découverte voit seulement le sommaire verrouillé. */
export default async function Formation() {
  const p = await requireProfile("/espace/formation");
  const { data: plan } = await adminClient().from("plans").select("name,can_publish").eq("id", p.plan).maybeSingle();
  const allowed = p.is_admin || Boolean(plan?.can_publish);
  return (
    <div className="stagger space-y-6">
      <div className="animate-fade-up">
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-slate-900"><GraduationCap className="h-7 w-7 text-blue-600" aria-hidden /> Formation</h1>
        <p className="mt-1 text-sm text-slate-600">{FORMATION.length} modules, environ {totalMinutes} minutes pour bien utiliser votre logiciel.</p>
      </div>

      {!allowed && (
        <div className="animate-fade-up rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-amber-50 px-5 py-4">
          <p className="flex items-center gap-2 font-semibold text-slate-900"><Lock className="h-4 w-4" aria-hidden /> La formation est réservée à la formule Pro et aux formules supérieures</p>
          <p className="mt-1 text-sm text-slate-700">Votre formule actuelle ({plan?.name ?? p.plan}) vous permet de découvrir MiniSoft RCA, sans accès aux leçons.</p>
          <Link href="/espace/abonnement" className="btn btn-primary mt-3">Voir les formules</Link>
        </div>
      )}

      <div className="space-y-4">
        {FORMATION.map((m) => (
          <section key={m.id} className="glass animate-fade-up rounded-2xl p-5" aria-labelledby={m.id}>
            <h2 id={m.id} className="font-display text-lg font-semibold text-slate-900">{m.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{m.goal}</p>
            {allowed ? (
              <div className="mt-3 space-y-2">
                {m.lessons.map((l) => (
                  <details key={l.title} className="rounded-xl border border-slate-200 bg-white p-3">
                    <summary className="cursor-pointer font-medium text-slate-900">{l.title} <span className="ml-1 text-xs font-normal text-slate-500">· {l.minutes} min</span></summary>
                    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">{l.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                    {l.tip && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Astuce : {l.tip}</p>}
                  </details>
                ))}
              </div>
            ) : (
              <ul className="mt-3 space-y-1 text-sm text-slate-500">{m.lessons.map((l) => <li key={l.title} className="flex items-center gap-2"><Lock className="h-3.5 w-3.5" aria-hidden /> {l.title}</li>)}</ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
