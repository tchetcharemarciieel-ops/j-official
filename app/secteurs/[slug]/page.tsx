import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/components/Reveal";
import { LeadForm } from "@/components/LeadForm";
import { SECTOR_PAGES, getSectorPage } from "@/lib/marketing";
import { SECTORS } from "@/lib/generator";
import { formatValue } from "@/lib/records";
import { sampleRecord } from "@/lib/checks";
import { siteHref } from "@/lib/site-mode";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return SECTOR_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = getSectorPage((await params).slug);
  if (!page) return {};
  return { title: page.seoTitle, description: page.seoDescription, alternates: { canonical: `/secteurs/${page.slug}` }, openGraph: { title: page.seoTitle, description: page.seoDescription } };
}

export default async function SectorPage({ params }: Props) {
  const page = getSectorPage((await params).slug);
  if (!page) notFound();
  const spec = page.template.build();
  const main = spec.entities[0]!;
  const cols = main.fields.filter((f) => f.showInTable).slice(0, 4);
  const rows = [0, 1, 2].map((i) => sampleRecord(main, i));
  const icon = SECTORS[page.template.sector]?.icon;
  const demoHref = `/demo?probleme=${encodeURIComponent(page.example)}`;

  return (
    <div className="bg-aurora">
      <SiteHeader />
      <main id="contenu">
        <section className="px-4 pb-16 pt-14 sm:px-6">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
            <Reveal>
              <p className="text-sm text-brand-300">{icon} {page.audience}</p>
              <h1 className="mt-3 font-display text-4xl font-bold leading-tight text-white sm:text-5xl">{page.headline}</h1>
              <p className="mt-5 text-lg text-slate-300">{page.subtitle}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={demoHref} className="btn btn-primary">Essayer gratuitement, sans inscription</Link>
                <a href="#demande" className="btn btn-ghost">Demander une démonstration</a>
              </div>
              <p className="mt-3 text-xs text-slate-500">Prêt en quelques minutes · En français · Montants en FCFA · Sur téléphone et ordinateur</p>
            </Reveal>
            <Reveal delay={150}>
              <div className="rounded-2xl bg-white p-4 text-slate-900 shadow-2xl" aria-label={`Aperçu du logiciel ${page.template.name}`}>
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: spec.theme.primary }}>{spec.theme.logoText}</span>
                  <span className="font-semibold">{page.template.name}</span>
                  <span className="ml-auto text-xs text-slate-400">{spec.entities.map((e) => e.icon).join(" ")}</span>
                </div>
                <p className="mt-3 text-sm font-semibold">{main.icon} {main.labelPlural}</p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-400"><tr>{cols.map((c) => <th key={c.key} className="py-1.5 pr-3 font-medium">{c.label}</th>)}</tr></thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100">{cols.map((c) => <td key={c.key} className="py-2 pr-3">{c.type === "relation" ? "—" : formatValue(c, r[c.key])}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {spec.dashboard.slice(0, 3).map((w) => <div key={w.label} className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">{w.label}</div>)}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <Reveal><h2 className="font-display text-3xl font-bold text-white">Ce que vous gagnez</h2></Reveal>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {page.benefits.map((b, i) => (
                <Reveal key={b.title} delay={i * 80} className="glass rounded-2xl p-5">
                  <h3 className="font-semibold text-white">✓ {b.title}</h3>
                  <p className="mt-2 text-sm text-slate-400">{b.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
            <Reveal className="glass rounded-2xl p-6">
              <h2 className="font-display text-xl font-semibold text-white">Problèmes que ce logiciel résout</h2>
              <ul className="mt-4 space-y-2 text-slate-300">{page.template.problems.map((p) => <li key={p}>✗ {p}</li>)}</ul>
            </Reveal>
            <Reveal delay={100} className="glass rounded-2xl p-6">
              <h2 className="font-display text-xl font-semibold text-white">Inclus dès le départ</h2>
              <ul className="mt-4 space-y-2 text-slate-300">
                {spec.entities.map((e) => <li key={e.key}>{e.icon} {e.labelPlural} — {e.fields.slice(0, 4).map((f) => f.label.toLowerCase()).join(", ")}…</li>)}
                <li>📊 Tableau de bord, recherche, filtres, export Excel (CSV) et PDF</li>
                <li>👥 Accès pour vos employés avec des droits limités</li>
              </ul>
              <p className="mt-4 text-sm text-slate-400">Tout est modifiable : ajoutez un champ, une page ou changez les couleurs en le demandant en français.</p>
            </Reveal>
          </div>
        </section>

        <section id="demande" className="scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_1.3fr]">
            <Reveal>
              <h2 className="font-display text-3xl font-bold text-white">Voyons votre cas ensemble</h2>
              <p className="mt-3 text-slate-300">Laissez vos coordonnées : nous préparons une démonstration avec votre façon de travailler, gratuitement et sans engagement.</p>
              <p className="mt-4 text-sm text-slate-400">Vous préférez essayer seul ? <Link href={demoHref} className="text-brand-300 underline">Lancez la démo</Link> ou <Link href={siteHref("/inscription")} className="text-brand-300 underline">créez votre compte gratuit</Link>.</p>
            </Reveal>
            <Reveal delay={100} className="glass rounded-2xl p-6">
              <LeadForm source={`secteur:${page.slug}`} defaultSector={page.template.category === "Commerce" ? "Commerce / boutique" : ""} />
            </Reveal>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Autres secteurs</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {SECTOR_PAGES.filter((p) => p.slug !== page.slug).map((p) => (
                <Link key={p.slug} href={`/secteurs/${p.slug}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:text-white">
                  {SECTORS[p.template.sector]?.icon} {p.template.category}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
