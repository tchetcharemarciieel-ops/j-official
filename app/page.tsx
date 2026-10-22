import { siteHref, STATIC_SITE } from "@/lib/site-mode";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, FileText, LifeBuoy, Settings, ShieldCheck, Users } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { HeroPrompt } from "@/components/HeroPrompt";
import { Reveal } from "@/components/Reveal";
import { SECTOR_PAGES } from "@/lib/marketing";
import { getModule } from "@/lib/modules";
import { getPlans, xaf } from "@/lib/plans";
import { CREDIT_COSTS, SITE_URL } from "@/lib/config";
import { LeadForm } from "@/components/LeadForm";
import { getSite } from "@/lib/site";
import { ScrollStory } from "@/components/story/ScrollStory";
import { TiltOnScroll } from "@/components/TiltOnScroll";

export const dynamic = "force-dynamic";

const PROBLEMS = [
  { title: "Des cahiers qui se perdent", text: "Ventes, commandes et dettes notées à la main, difficiles à retrouver et faciles à perdre." },
  { title: "Des ruptures de stock imprévues", text: "Vous découvrez qu'un produit manque au moment où le client le demande." },
  { title: "Un chiffre d'affaires inconnu", text: "Pour connaître les recettes du mois, il faut tout recompter à la main." },
  { title: "Des clients qui doivent de l'argent", text: "Les crédits accordés ne sont pas suivis et les relances sont oubliées." },
  { title: "Une équipe difficile à suivre", text: "Vos employés vous appellent pour savoir où en est une commande ou un dossier." },
  { title: "Des logiciels inadaptés", text: "Les logiciels du marché sont chers, en anglais ou trop compliqués pour votre activité." },
];

const STEPS = [
  { title: "Décrivez votre besoin", text: "Expliquez votre activité et votre problème en quelques phrases, à l'écrit ou à la voix. Vous pouvez joindre un fichier Excel." },
  { title: "Validez le plan proposé", text: "MiniSoft RCA propose les écrans, les champs et le tableau de bord. Vous gardez ou retirez chaque fonctionnalité." },
  { title: "Testez votre logiciel", text: "Le logiciel est créé avec des exemples de données et vérifié par des tests automatiques. Vous l'essayez avant de le publier." },
  { title: "Utilisez-le avec votre équipe", text: "Publiez-le sur un lien permanent et invitez vos employés, chacun avec ses droits." },
];

const FEATURES = [
  { icon: BarChart3, title: "Tableau de bord", text: "Ventes, dépenses et totaux du mois en FCFA, calculés automatiquement à partir de vos données." },
  { icon: Users, title: "Équipe et rôles", text: "Propriétaire, gestionnaire, employé, lecteur : chacun ne voit et ne modifie que ce qui le concerne." },
  { icon: FileText, title: "Fiches et exports", text: "Clients, produits, commandes ou factures, avec recherche, filtres et export Excel ou PDF." },
  { icon: Settings, title: "Modifications simples", text: "Ajoutez un champ ou changez les couleurs en le demandant. Chaque version est enregistrée." },
  { icon: ShieldCheck, title: "Données protégées", text: "Les données de chaque entreprise sont séparées. Chaque action est vérifiée selon le rôle de l'utilisateur." },
  { icon: LifeBuoy, title: "Accompagnement", text: "Nous vous aidons à importer vos fichiers et à prendre en main votre logiciel." },
];

const BENEFITS = [
  { title: "Du temps gagné chaque jour", text: "Plus besoin de recopier ni de recompter : les totaux sont calculés pour vous." },
  { title: "Moins d'erreurs et de pertes", text: "Chaque vente, dépense et paiement est enregistré et retrouvé en quelques secondes." },
  { title: "De meilleures décisions", text: "Vous savez ce qui se vend, ce qui manque et combien vous gagnez." },
  { title: "Un prix adapté", text: "Une formule gratuite pour commencer, puis des prix mensuels en FCFA." },
  { title: "Sur téléphone et ordinateur", text: "Votre logiciel s'ouvre dans le navigateur, sans installation." },
  { title: "En français, pour votre métier", text: "Les écrans et les mots correspondent à votre activité, pas à un logiciel générique." },
];

const FAQ = [
  { q: "Comment créer mon logiciel ?", a: "Cliquez sur « Créer mon logiciel », décrivez votre besoin et répondez à quelques questions. Vous validez ensuite le plan proposé, puis le logiciel est créé et testé. Vous pouvez aussi partir d'un modèle." },
  { q: "Dois-je savoir programmer ?", a: "Non. Tout se fait en français, avec des formulaires simples. Le logiciel est assemblé à partir de composants déjà testés." },
  { q: "Puis-je utiliser mon logiciel sur téléphone ?", a: "Oui. Votre logiciel s'ouvre dans Chrome ou tout navigateur récent, sur téléphone, tablette et ordinateur. Sans connexion, les nouvelles fiches sont gardées sur l'appareil puis envoyées au retour du réseau." },
  { q: "Qui peut accéder à mes données ?", a: "Seules les personnes que vous invitez, avec le rôle que vous choisissez. Les données de chaque entreprise sont séparées et chaque action est vérifiée sur le serveur." },
  { q: "Puis-je modifier mon logiciel après sa création ?", a: "Oui, par l'assistant intégré ou dans les paramètres (couleurs, logo, textes). Chaque modification crée une nouvelle version testée. Vos données sont conservées et vous pouvez revenir à une version précédente." },
  { q: "Puis-je importer mes fichiers Excel ?", a: "Oui. Vous pouvez importer un fichier Excel ou CSV : les colonnes sont associées aux champs de votre logiciel et les lignes en erreur vous sont signalées." },
  { q: "Combien coûte la création ?", a: `La formule Découverte est gratuite, avec des crédits limités et sans publication. Une analyse coûte ${CREDIT_COSTS.diagnose} crédits et une modification ${CREDIT_COSTS.modify} crédits. Les formules payantes sont affichées en FCFA dans la section Tarifs.` },
  { q: "Comment se passe le paiement ?", a: "Le paiement en ligne n'est pas encore disponible : aucun prélèvement n'est effectué. Le passage à une formule payante se fait avec l'équipe MiniSoft RCA et peut être arrêté à tout moment." },
  { q: "Que se passe-t-il si la création échoue ?", a: "Les crédits réservés sont remboursés, l'erreur est expliquée et des corrections automatiques sont proposées lorsque c'est possible." },
];

function SectionTitle({ eyebrow, title, text, center = true }: { eyebrow?: string; title: string; text?: string; center?: boolean }) {
  return (
    <Reveal className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && <p className="text-sm font-semibold text-blue-600">{eyebrow}</p>}
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">{text}</p>}
    </Reveal>
  );
}

export default async function Home() {
  const [plans, site] = await Promise.all([getPlans(), getSite()]);
  // Textes et FAQ réglables dans l'administration ; à défaut, les textes d'origine.
  const faq = site.faq.items.length ? site.faq.items : FAQ;
  const solutions = SECTOR_PAGES.filter((s) => !site.templates.disabled.includes(s.slug));
  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        // Données structurées : logiciel + questions fréquentes (affichage enrichi dans Google)
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "MiniSoft RCA",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: SITE_URL,
              description: "Plateforme qui crée des mini-logiciels de gestion sur mesure pour les entreprises : commandes, stocks, clients, rendez-vous, factures.",
              inLanguage: "fr",
              offers: plans.map((p) => ({ "@type": "Offer", name: p.name, price: p.price_xaf, priceCurrency: "XAF" })),
            },
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ]).replace(/</g, "\\u003c"),
        }}
      />
      <SiteHeader />
      <main id="contenu">
        {/* Section principale */}
        <section className="border-b border-slate-200 px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <Reveal>
              <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
                Restaurants, pharmacies, garages, commerces, écoles
              </p>
              <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-[3.4rem]">{site.home.heroTitle || "Des logiciels simples pour développer votre entreprise"}</h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">{site.home.heroSubtitle || "Décrivez vos besoins et obtenez un mini-logiciel adapté à votre activité. En français, avec vos montants en FCFA."}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={siteHref("/creer")} className="btn btn-primary px-6 text-base">
                  Créer mon logiciel
                </Link>
                <Link href="/#solutions" className="btn btn-ghost px-6 text-base">
                  Découvrir nos solutions
                </Link>
              </div>
              <ul className="mt-8 grid gap-2 text-sm text-slate-600 sm:grid-cols-2" aria-label="Points clés">
                {["Gratuit pour commencer", "Sans installation", "Sur téléphone et ordinateur", "Données séparées par entreprise"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={100}>
              <TiltOnScroll>
                <ScreenPreview />
              </TiltOnScroll>
            </Reveal>
          </div>
        </section>

        {/* Histoire animée au défilement */}
        <div id="histoire" className="scroll-mt-16">
          <ScrollStory />
        </div>

        {/* Problèmes résolus */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="Les problèmes que nous résolvons" title="Votre gestion quotidienne, enfin simplifiée" text="Ces situations vous sont familières ? Un logiciel adapté à votre activité les règle au quotidien." />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PROBLEMS.map((p, i) => (
                <Reveal key={p.title} delay={(i % 3) * 60} className="rounded-xl border border-slate-200 bg-white p-6">
                  <h3 className="font-semibold text-slate-900">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Solutions */}
        <section id="solutions" className="scroll-mt-20 bg-slate-100 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <SectionTitle center={false} eyebrow="Nos solutions" title="Un logiciel pour chaque métier" text="Partez d'un modèle prêt à l'emploi, puis adaptez-le à votre entreprise." />
              <Link href="/modeles" className="btn btn-ghost shrink-0">
                Voir tous les modèles
              </Link>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {solutions.map((s, i) => (
                <Reveal key={s.slug} delay={(i % 3) * 60}>
                  <Link href={`/secteurs/${s.slug}`} className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-6 transition-colors hover:border-blue-300">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.template.category}</p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-900">{s.template.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.template.description}</p>
                    <ul className="mt-4 flex flex-wrap gap-1.5">
                      {s.template.modules.map((m) => (
                        <li key={m} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{getModule(m)?.title ?? m}</li>
                      ))}
                    </ul>
                    <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-blue-600">
                      Découvrir <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Étapes */}
        <section id="comment" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="Comment ça marche" title="Votre logiciel en quatre étapes" text="Du besoin au logiciel en ligne, sans connaissances techniques." />
            <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 60} className="rounded-xl border border-slate-200 bg-white p-6">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">{i + 1}</span>
                  <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.text}</p>
                </Reveal>
              ))}
            </ol>
            <Reveal className="mt-10 text-center">
              <Link href="/demo" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">
                Essayer la démonstration sans créer de compte <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Reveal>
          </div>
        </section>

        {/* Fonctionnalités */}
        <section id="fonctionnalites" className="scroll-mt-20 bg-slate-100 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="Fonctionnalités" title="Tout ce qu'il faut pour bien gérer" text="Chaque logiciel dispose de sa base de données, de ses utilisateurs et de son lien permanent." />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 60} className="rounded-xl border border-slate-200 bg-white p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600">
                    <f.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Avantages */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_1.4fr] lg:items-start">
            <SectionTitle center={false} eyebrow="Avantages" title="Pourquoi les entreprises choisissent MiniSoft RCA" text="Un outil pensé pour les réalités des entreprises de Centrafrique et d'Afrique : simple, abordable et accessible partout." />
            <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {BENEFITS.map((b, i) => (
                <Reveal as="li" key={b.title} delay={(i % 2) * 60} className="flex gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                  <div>
                    <h3 className="font-semibold text-slate-900">{b.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{b.text}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* Tarifs */}
        <section id="tarifs" className="scroll-mt-20 bg-slate-100 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="Tarifs" title="Des formules claires, en FCFA" text="Prix mensuels en francs CFA. Les crédits servent à l'analyse et aux modifications ; une opération échouée est remboursée." />
            {STATIC_SITE && <p className="mx-auto mt-6 max-w-2xl rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm text-blue-800">Les comptes et les formules ouvriront avec la version complète. En attendant, la démonstration est gratuite et sans inscription.</p>}
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((p, i) => (
                <Reveal key={p.id} delay={i * 60} className={`flex flex-col rounded-xl border bg-white p-6 ${p.id === "pro" ? "border-blue-600 ring-1 ring-blue-600" : "border-slate-200"}`}>
                  {p.id === "pro" && <span className="mb-3 self-start rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Recommandée</span>}
                  <h3 className="text-xl font-semibold text-slate-900">{p.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{p.description}</p>
                  <p className="mt-5 text-3xl font-bold text-slate-900">
                    {p.price_xaf === 0 ? "Gratuit" : xaf(p.price_xaf)}
                    {p.price_xaf > 0 && <span className="text-sm font-normal text-slate-500"> / mois</span>}
                  </p>
                  <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-700">
                    {[
                      `${p.monthly_credits} crédits par mois`,
                      `${p.max_projects} logiciel${p.max_projects > 1 ? "s" : ""}`,
                      `${p.max_members} utilisateur${p.max_members > 1 ? "s" : ""} par logiciel`,
                      p.can_publish ? "Publication avec lien permanent" : "Aperçu uniquement, sans publication",
                      "Tests, versions et exports",
                    ].map((t) => (
                      <li key={t} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
                        {t}
                      </li>
                    ))}
                  </ul>
                  <Link href={siteHref(p.price_xaf === 0 ? "/inscription" : "/espace/abonnement")} className={`btn mt-6 ${p.id === "pro" ? "btn-primary" : "btn-ghost"}`}>
                    {p.price_xaf === 0 ? "Commencer gratuitement" : "Choisir cette formule"}
                  </Link>
                </Reveal>
              ))}
            </div>
            <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-slate-500">
              Coût des opérations : analyse {CREDIT_COSTS.diagnose} crédits, modification {CREDIT_COSTS.modify} crédits, question à l&apos;assistant {CREDIT_COSTS.ask} crédit. Le paiement en ligne n&apos;est pas encore activé : aucun prélèvement n&apos;est effectué sans votre accord.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <SectionTitle eyebrow="FAQ" title="Questions fréquentes" />
            <div className="mt-10 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {faq.map((f) => (
                <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900">
                    {f.q}
                    <span className="text-xl leading-none text-slate-400 transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Présentez votre projet */}
        <section className="bg-slate-900 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Présentez votre projet</h2>
              <p className="mt-4 text-lg text-slate-300">Décrivez votre besoin en quelques phrases : le plan de votre logiciel est prêt en quelques instants.</p>
            </Reveal>
            <Reveal delay={80} className="mt-8">
              <HeroPrompt />
            </Reveal>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <span id="demonstration" className="block scroll-mt-20" aria-hidden />
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.2fr]">
            <Reveal>
              <p className="text-sm font-semibold text-blue-600">Contact</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Parlons de votre entreprise</h2>
              <p className="mt-4 leading-relaxed text-slate-600">Laissez vos coordonnées : nous vous présentons le logiciel adapté à votre activité. Le rendez-vous est gratuit et sans engagement.</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {["Démonstration avec vos propres exemples", "Aide à l'import de vos fichiers Excel", "Conseils pour équiper vos employés"].map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={80} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              {STATIC_SITE ? (
                <div>
                  <p className="text-slate-700">Le formulaire de contact sera disponible avec la version complète du site.</p>
                  <Link href="/demo" className="btn btn-primary mt-4">Essayer la démonstration</Link>
                </div>
              ) : (
                <LeadForm source="accueil" />
              )}
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Aperçu statique d'un écran de logiciel (exemple illustratif, données fictives). */
function ScreenPreview() {
  const rows = [
    ["Commande n° 1024", "Table 4", "18 500 FCFA", "Payée"],
    ["Commande n° 1025", "À emporter", "7 000 FCFA", "En préparation"],
    ["Commande n° 1026", "Table 2", "24 000 FCFA", "Payée"],
  ];
  return (
    <figure className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-600 text-[11px] font-bold text-white">RB</span>
            <span className="text-sm font-semibold text-slate-900">Restaurant Le Baobab</span>
          </div>
          <span className="text-xs text-slate-500">Tableau de bord</span>
        </div>
        <div className="grid grid-cols-3 gap-3 p-4">
          {[
            ["Ventes du jour", "49 500"],
            ["Dépenses", "12 000"],
            ["Stock bas", "3 produits"],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-slate-200 p-3">
              <p className="text-[11px] text-slate-500">{l}</p>
              <p className="mt-1 text-sm font-bold text-slate-900 sm:text-base">{v}</p>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-2 font-medium">Commande</th>
                <th className="hidden pb-2 font-medium sm:table-cell">Service</th>
                <th className="pb-2 font-medium">Montant</th>
                <th className="pb-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rows.map(([a, b, c, d]) => (
                <tr key={a}>
                  <td className="py-2">{a}</td>
                  <td className="hidden py-2 sm:table-cell">{b}</td>
                  <td className="py-2">{c}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${d === "Payée" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-700"}`}>{d}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <figcaption className="px-1 pt-2 text-center text-xs text-slate-500">Exemple d&apos;écran d&apos;un logiciel de restaurant (données fictives)</figcaption>
    </figure>
  );
}
