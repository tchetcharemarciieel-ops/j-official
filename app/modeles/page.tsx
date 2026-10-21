import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/components/Reveal";
import { TEMPLATES } from "@/lib/templates";
import { getProfile } from "@/lib/auth";
import { UseTemplateButton } from "./UseTemplateButton";

export const metadata = { title: "Modèles de logiciels" };
export const dynamic = "force-dynamic";

export default async function Modeles() {
  const profile = await getProfile().catch(() => null);
  const categories = Array.from(new Set(TEMPLATES.map((t) => t.category)));
  return (
    <div className="min-h-dvh bg-white">
      <SiteHeader />
      <main id="contenu" className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Modèles de logiciels</h1>
        <p className="mt-3 max-w-2xl text-slate-600">Choisissez un modèle et adaptez-le à votre entreprise. Vous obtenez votre propre logiciel : vos données ne sont jamais partagées avec d&apos;autres clients.</p>
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Catégories">
          {categories.map((c) => <a key={c} href={`#${TEMPLATES.find((t) => t.category === c)!.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 hover:border-blue-300 hover:text-blue-700">{c}</a>)}
        </nav>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {TEMPLATES.map((t, i) => {
            const spec = t.build();
            return (
              <Reveal key={t.id} delay={(i % 2) * 80}>
                <article id={t.id} className="glass flex h-full scroll-mt-24 flex-col rounded-xl p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.category}</p>
                      <h2 className="mt-1 text-xl font-semibold text-slate-900">{t.name}</h2>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{t.description}</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <h3 className="text-xs font-semibold uppercase text-slate-500">Problèmes résolus</h3>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-700">{t.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold uppercase text-slate-500">Fonctions incluses</h3>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-700">{spec.entities.map((e) => <li key={e.key}>{e.labelPlural}</li>)}</ul>
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-900" aria-label={`Aperçu de ${t.name}`}>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="grid h-7 w-7 place-items-center rounded-lg text-xs text-white" style={{ background: spec.theme.primary }}>{spec.theme.logoText}</span>
                      {t.name}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {spec.dashboard.slice(0, 3).map((w) => <div key={w.label} className="rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-600">{w.label}</div>)}
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-slate-500">Personnalisable : {t.customization.join(" · ")}</p>
                  <div className="mt-5 flex-1" />
                  <UseTemplateButton templateId={t.id} defaultName={t.name} loggedIn={Boolean(profile)} />
                </article>
              </Reveal>
            );
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
