import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/components/Reveal";
import { TEMPLATES } from "@/lib/templates";
import { SECTORS } from "@/lib/generator";
import { getProfile } from "@/lib/auth";
import { UseTemplateButton } from "./UseTemplateButton";

export const metadata = { title: "Bibliothèque de modèles" };
export const dynamic = "force-dynamic";

export default async function Modeles() {
  const profile = await getProfile().catch(() => null);
  const categories = Array.from(new Set(TEMPLATES.map((t) => t.category)));
  return (
    <div className="bg-aurora min-h-dvh">
      <SiteHeader />
      <main id="contenu" className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">Bibliothèque de modèles</h1>
        <p className="mt-3 max-w-2xl text-slate-400">Choisissez un point de départ, personnalisez-le avec l&apos;IA : vous obtenez votre propre logiciel indépendant. Aucune donnée n&apos;est partagée entre clients.</p>
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Catégories">
          {categories.map((c) => <a key={c} href={`#${TEMPLATES.find((t) => t.category === c)!.id}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-300 hover:text-white">{c}</a>)}
        </nav>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {TEMPLATES.map((t, i) => {
            const spec = t.build();
            return (
              <Reveal key={t.id} delay={(i % 2) * 80}>
                <article id={t.id} className="glass flex h-full scroll-mt-24 flex-col rounded-2xl p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-brand-300">{t.category}</p>
                      <h2 className="mt-1 font-display text-xl font-semibold text-white">{SECTORS[t.sector]?.icon} {t.name}</h2>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{t.description}</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <h3 className="text-xs font-semibold uppercase text-slate-500">Problèmes résolus</h3>
                      <ul className="mt-1 space-y-1 text-sm text-slate-300">{t.problems.map((p) => <li key={p}>• {p}</li>)}</ul>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold uppercase text-slate-500">Fonctions incluses</h3>
                      <ul className="mt-1 space-y-1 text-sm text-slate-300">{spec.entities.map((e) => <li key={e.key}>{e.icon} {e.labelPlural}</li>)}</ul>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl bg-white p-3 text-slate-900" aria-label={`Aperçu de ${t.name}`}>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="grid h-7 w-7 place-items-center rounded-lg text-xs text-white" style={{ background: spec.theme.primary }}>{spec.theme.logoText}</span>
                      {t.name}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {spec.dashboard.slice(0, 3).map((w) => <div key={w.label} className="rounded-lg bg-slate-100 p-2 text-[11px] text-slate-600">{w.label}</div>)}
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
