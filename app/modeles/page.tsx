import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { TEMPLATES } from "@/lib/templates";
import { getProfile } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { UseTemplateButton } from "./UseTemplateButton";
import { Catalog, type CatalogItem } from "@/components/catalog/Catalog";

export const metadata = { title: "Modèles de logiciels" };
export const dynamic = "force-dynamic";

export default async function Modeles() {
  const profile = await getProfile().catch(() => null);
  const { disabled } = await getSetting("templates");
  const available = TEMPLATES.filter((t) => !disabled.includes(t.id));
  const categories = Array.from(new Set(available.map((t) => t.category)));
  const iconFor = (id: string) => (["restaurant", "garage", "hotel", "pharmacie", "ecole"].find((k) => id.includes(k)) ?? "default");
  const items: CatalogItem[] = available.map((t) => {
    const spec = t.build();
    return {
      id: t.id, icon: iconFor(t.id), tone: "slate", name: t.name, short: t.description, features: spec.entities.map((e) => e.labelPlural).slice(0, 3),
      detail: {
        description: t.description,
        features: spec.entities.map((e) => e.labelPlural),
        benefits: [...t.problems.map((p) => `Résout : ${p}`), `Personnalisable : ${t.customization.join(", ")}`],
      },
    };
  });
  const actions = Object.fromEntries(available.map((t) => [t.id, <UseTemplateButton key={t.id} templateId={t.id} defaultName={t.name} loggedIn={Boolean(profile)} />]));
  return (
    <div className="min-h-dvh bg-white">
      <SiteHeader />
      <main id="contenu" className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Modèles de logiciels</h1>
        <p className="mt-3 max-w-2xl text-slate-600">Choisissez un modèle et adaptez-le à votre entreprise. Vous obtenez votre propre logiciel : vos données ne sont jamais partagées avec d&apos;autres clients.</p>
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Catégories">
          {categories.map((c) => <a key={c} href={`#${available.find((t) => t.category === c)!.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 hover:border-blue-300 hover:text-blue-700">{c}</a>)}
        </nav>
        <div className="mt-8"><Catalog items={items} actions={actions} /></div>
      </main>
      <SiteFooter />
    </div>
  );
}
