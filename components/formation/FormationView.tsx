import { CONCLUSION_VIDEO, type FormationModule } from "@/lib/formation";

/** Affichage de la formation (modules dépliables + vidéo de conclusion). Sans état : utilisable côté serveur et client. */
export function FormationView({ modules }: { modules: FormationModule[] }) {
  return (
    <div className="space-y-4">
      {modules.map((m) => (
        <section key={m.id} className="glass rounded-2xl p-5" aria-labelledby={`f-${m.id}`}>
          <h2 id={`f-${m.id}`} className="font-display text-lg font-semibold text-slate-900">{m.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{m.goal}</p>
          <div className="mt-3 space-y-2">
            {m.lessons.map((l) => (
              <details key={l.title} className="rounded-xl border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer font-medium text-slate-900">{l.title} <span className="ml-1 text-xs font-normal text-slate-500">· {l.minutes} min</span></summary>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">{l.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                {l.tip && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Astuce : {l.tip}</p>}
              </details>
            ))}
          </div>
        </section>
      ))}
      <section className="glass rounded-2xl p-5" aria-labelledby="f-conclusion">
        <h2 id="f-conclusion" className="font-display text-lg font-semibold text-slate-900">Pour conclure</h2>
        <p className="mt-1 text-sm text-slate-600">Une courte vidéo pour retenir l&apos;essentiel (avec le son).</p>
        <video className="mx-auto mt-3 aspect-[9/16] max-h-[70svh] rounded-2xl bg-slate-900" src={CONCLUSION_VIDEO.src} poster={CONCLUSION_VIDEO.poster} controls playsInline preload="none" aria-label="Vidéo de conclusion de la formation" />
      </section>
    </div>
  );
}
