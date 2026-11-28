import { siteHref, STATIC_SITE } from "@/lib/site-mode";
import Link from "next/link";
import { ArrowRight, BarChart3, GraduationCap, History, Bell, Sparkles, Clock, Bike, Boxes, Briefcase, MapPin, Package, Truck, Building2, CalendarDays, Check, FileText, LifeBuoy, QrCode, Receipt, Settings, ShieldCheck, ShoppingCart, Users, Wallet } from "lucide-react";
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
import { TiltOnScroll } from "@/components/TiltOnScroll";
import { Suspense } from "react";
import { ScrollScenes } from "@/components/ScrollScenes";
import { Catalog, type CatalogItem } from "@/components/catalog/Catalog";
import { ProductCatalog } from "@/components/catalog/ProductCatalog";
import { ScrollProgress } from "@/components/landing/ScrollProgress";
import { CountUp } from "@/components/landing/CountUp";

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
  { title: "Testez votre logiciel", text: "Le logiciel est créé avec des exemples de données et vérifié par des tests automatiques. Vous l'essayez, puis vous le faites évoluer quand vous voulez." },
  { title: "Utilisez-le avec votre équipe", text: "Publiez-le sur un lien permanent, invitez vos employés avec leurs postes et suivez la formation incluse." },
];

const FEATURES = [
  { icon: BarChart3, title: "Tableau de bord professionnel", text: "Graphiques, indicateurs et listes en FCFA, calculés automatiquement à partir de vos données et adaptés à votre métier." },
  { icon: Users, title: "Clients en vrai CRM", text: "Une fiche détaillée par client ou élève : coordonnées, historique, notes, pièces et exports Excel ou PDF." },
  { icon: Sparkles, title: "Faire évoluer mon logiciel", text: "Demandez un changement en français : vous voyez l'aperçu avant/après, puis vous enregistrez ou vous annulez." },
  { icon: History, title: "Versions et sauvegardes", text: "Chaque modification crée une version. Vos données, vos utilisateurs et votre lien sont conservés ; revenez en arrière si besoin." },
  { icon: GraduationCap, title: "Formation incluse (Pro)", text: "Chaque logiciel s'accompagne d'une formation pas à pas et d'une vidéo de conclusion pour bien le prendre en main." },
  { icon: Users, title: "Équipe, postes et droits", text: "Créez des postes (caissier, comptable, chauffeur…) : chacun ne voit et ne modifie que ce qui le concerne." },
  { icon: Clock, title: "Analyse en arrière-plan", text: "Lancez l'analyse de votre besoin, quittez la page, revenez plus tard : le résultat vous attend." },
  { icon: Bell, title: "Notifications", text: "Soyez prévenu quand une analyse est terminée, qu'un stock baisse ou qu'une échéance approche." },
  { icon: FileText, title: "Documents et exports", text: "Factures, reçus, bulletins et rapports en PDF, exports Excel, import de vos fichiers existants." },
  { icon: ShieldCheck, title: "Données protégées", text: "Les données de chaque entreprise sont séparées. Chaque action est vérifiée côté serveur selon le rôle." },
  { icon: Settings, title: "Sur téléphone, même hors connexion", text: "Utilisable dans le navigateur ; sans réseau, les nouvelles fiches sont gardées puis envoyées au retour de la connexion." },
  { icon: LifeBuoy, title: "Accompagnement", text: "Nous vous aidons à importer vos fichiers et à prendre en main votre logiciel." },
];

const NEWS = [
  { icon: BarChart3, tag: "Nouveau", title: "Des tableaux de bord de logiciel professionnel", text: "Cartes d'indicateurs, courbes, histogrammes, répartitions et listes récentes : une vue claire dès l'ouverture, sur mesure pour votre secteur." },
  { icon: Users, tag: "Nouveau", title: "Un module Clients complet", text: "Cherchez, filtrez, ouvrez une fiche détaillée avec son historique et ses actions rapides. Le même confort pour les ventes, les produits et les autres modules." },
  { icon: Sparkles, tag: "Nouveau", title: "Votre logiciel évolue avec vous", text: "Ajoutez un module, un champ ou un rôle sans tout refaire : aperçu avant/après, versions et sauvegardes automatiques." },
  { icon: GraduationCap, tag: "Nouveau", title: "MiniSoft École", text: "Élèves, classes, notes, présences, frais de scolarité, bulletins et espace parents, dans un logiciel pensé pour les établissements." },
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
  { q: "Puis-je modifier mon logiciel après sa création ?", a: "Oui, avec « Faire évoluer mon logiciel » : décrivez le changement (ou faites-le à la main), regardez l'aperçu avant/après, puis enregistrez ou annulez. Chaque modification crée une version testée ; vos données, vos utilisateurs et votre lien sont conservés, et vous pouvez revenir à une version précédente ou restaurer une sauvegarde." },
  { q: "Y a-t-il une formation pour apprendre à utiliser mon logiciel ?", a: "Oui. Avec la formule Pro, chaque logiciel créé s'accompagne d'une formation pas à pas sur son fonctionnement, avec une vidéo de conclusion." },
  { q: "Que se passe-t-il si je quitte la page pendant l'analyse ?", a: "Rien n'est perdu : l'analyse continue en arrière-plan. Vous revenez plus tard et le résultat est là ; vous êtes aussi prévenu par une notification." },
  { q: "Puis-je importer mes fichiers Excel ?", a: "Oui. Vous pouvez importer un fichier Excel ou CSV : les colonnes sont associées aux champs de votre logiciel et les lignes en erreur vous sont signalées." },
  { q: "Combien coûte la création ?", a: `La formule Découverte est gratuite : 20 crédits par mois, 1 logiciel, 1 utilisateur et sans publication. Une analyse coûte ${CREDIT_COSTS.diagnose} crédits et une modification ${CREDIT_COSTS.modify} crédits. Les formules payantes, en FCFA, sont présentées dans votre espace (rubrique Abonnement).` },
  { q: "Comment se passe le paiement ?", a: "Le paiement en ligne n'est pas encore disponible : aucun prélèvement n'est effectué. Le passage à une formule payante se fait avec l'équipe MiniSoft RCA et peut être arrêté à tout moment." },
  { q: "Que se passe-t-il si la création échoue ?", a: "Les crédits réservés sont remboursés, l'erreur est expliquée et des corrections automatiques sont proposées lorsque c'est possible." },
];

function SectionTitle({ eyebrow, title, text, center = true }: { eyebrow?: string; title: string; text?: string; center?: boolean }) {
  return (
    <Reveal className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && <p className="text-sm font-semibold text-blue-600">{eyebrow}</p>}
      <h2 className="font-landing mt-2 text-3xl text-slate-900 sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">{text}</p>}
    </Reveal>
  );
}

export default async function Home() {
  const [plans, site] = await Promise.all([getPlans(), getSite()]);
  // Textes et FAQ réglables dans l'administration ; à défaut, les textes d'origine.
  const faq = site.faq.items.length ? site.faq.items : FAQ;
  const solutions = SECTOR_PAGES.filter((s) => !site.templates.disabled.includes(s.slug));
  const iconFor = (slug: string) => (["restaurant", "garage", "hotel", "pharmacie", "ecole"].find((k) => slug.includes(k)) ?? "default");
  const solutionItems: CatalogItem[] = solutions.map((s) => ({ id: s.slug, icon: iconFor(s.slug), tone: "slate", name: s.template.name, short: s.template.description, features: s.template.modules.slice(0, 3).map((m) => getModule(m)?.title ?? m), href: `/secteurs/${s.slug}` }));
  return (
    <div className="landing bg-white">
      <ScrollProgress />
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
        <section className="relative overflow-hidden border-b border-slate-200 hero-glow px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
          <div aria-hidden className="blob pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-200/50 blur-3xl" />
          <div aria-hidden className="blob blob-b pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <Reveal>
              <p className="badge-shine inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-sm font-medium text-indigo-800">
                <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden />
                Boutiques, bureaux, transport, écoles et plus
              </p>
              <h1 className="font-landing mt-6 text-4xl leading-tight text-slate-900 sm:text-5xl lg:text-[3.4rem]">{site.home.heroTitle || "Une phrase. Votre logiciel."}</h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">{site.home.heroSubtitle || "Décrivez votre activité en une phrase : MiniSoft RCA crée votre logiciel de gestion avec tableau de bord, clients, équipe et formation. En français, en FCFA."}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={siteHref("/creer")} className="btn btn-primary btn-cta px-6 text-base shadow-lg shadow-emerald-700/25 !bg-emerald-700 hover:!bg-emerald-800">
                  Créer mon logiciel <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href="/#solutions" className="btn btn-ghost px-6 text-base">
                  Découvrir nos solutions
                </Link>
              </div>
              <ul className="mt-8 grid gap-2 text-sm text-slate-600 sm:grid-cols-2" aria-label="Points clés">
                {["Gratuit pour commencer", "Sans installation", "Sur téléphone et ordinateur", "Évolue avec votre activité"].map((t, i) => (
                  <li key={t} className="flex items-center gap-2 animate-[fade-up_0.6s_both]" style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
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

        {/* Bandeau des métiers (réel : noms des modèles) */}
        <div className="overflow-hidden border-b border-slate-200 bg-white py-3" aria-label="Métiers pris en charge">
          <div className="marquee">
            {[0, 1].map((k) => (
              <ul key={k} className="flex shrink-0 items-center gap-8 pr-8 text-sm font-medium text-slate-500" aria-hidden={k === 1}>
                {["Boutique", "Bureau et agence", "Transport", "École", ...solutions.map((x) => x.template.name)].map((n) => (
                  <li key={n} className="flex items-center gap-8 whitespace-nowrap">{n}<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /></li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        {/* Vidéo de présentation */}
        <section id="presentation" className="scroll-mt-20 border-b border-slate-200 bg-white px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <SectionTitle eyebrow="En 25 secondes" title="Voir MiniSoft RCA en action" text="Faites défiler : la vidéo avance avec vous." />
            <div className="mt-6"><ScrollScenes /></div>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={siteHref("/creer")} className="btn btn-primary btn-cta px-6 !bg-emerald-700">Créer mon logiciel <ArrowRight className="h-4 w-4" aria-hidden /></Link>
              <Link href="/#logiciels" className="btn btn-ghost px-6">Voir les logiciels prêts à l&apos;emploi</Link>
            </div>
          </div>
        </section>

        {/* Logiciels prêts à l'emploi : catalogue compact */}
        <section id="logiciels" className="scroll-mt-20 bg-gradient-to-b from-white to-indigo-50/60 px-4 py-14 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="Prêts à l'emploi" title="Quatre logiciels complets, créés en quelques minutes" text="MiniSoft Shop, Bureau, Transport et École, ou un logiciel sur mesure : touchez une carte pour voir le détail." />
            <div className="mt-8"><Suspense fallback={null}><ProductCatalog mode="link" /></Suspense></div>
          </div>
        </section>

        {/* Nouveautés */}
        <section id="nouveautes" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="Ce qui vient d'arriver" title="Du neuf dans MiniSoft RCA" text="Des logiciels plus professionnels, plus faciles à faire évoluer et plus agréables à utiliser." />
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {NEWS.map((n, i) => (
                <Reveal key={n.title} variant={i % 2 ? "right" : "left"} delay={(i % 2) * 80} className="lift flex gap-4 rounded-xl border border-slate-200 bg-white p-6">
                  <span className="icon-pop grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><n.icon className="h-5 w-5" aria-hidden /></span>
                  <div>
                    <span className="badge-shine rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{n.tag}</span>
                    <h3 className="mt-2 font-semibold text-slate-900">{n.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{n.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-10 grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
              {[[4, "logiciels prêts à l'emploi"], [solutions.length, "modèles par métier"], [20, "crédits gratuits par mois"], [1, "lien permanent par logiciel"]].map(([n, l]) => (
                <div key={String(l)} className="rounded-xl bg-slate-50 p-4">
                  <p className="font-landing text-3xl text-blue-700"><CountUp to={Number(n)} /></p>
                  <p className="mt-1 text-xs text-slate-600">{l}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Problèmes résolus */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="Les problèmes que nous résolvons" title="Votre gestion quotidienne, enfin simplifiée" text="Ces situations vous sont familières ? Un logiciel adapté à votre activité les règle au quotidien." />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PROBLEMS.map((p, i) => (
                <Reveal key={p.title} delay={(i % 3) * 60} className="lift rounded-xl border border-slate-200 bg-white p-6" variant="zoom">
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
            <div className="mt-8"><Catalog items={solutionItems} /></div>
          </div>
        </section>

        {/* Étapes */}
        <section id="comment" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="Comment ça marche" title="Votre logiciel en quatre étapes" text="Du besoin au logiciel en ligne, sans connaissances techniques." />
            <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 90} className="lift rounded-xl border border-slate-200 bg-white p-6">
                  <span className="icon-pop grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">{i + 1}</span>
                  <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.text}</p>
                </Reveal>
              ))}
            </ol>
            <Reveal className="mt-10 text-center">
              <Link href="/demo" className="group inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">
                Essayer la démonstration sans créer de compte <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </Reveal>
          </div>
        </section>

        {/* Fonctionnalités */}
        <section id="fonctionnalites" className="scroll-mt-20 bg-slate-100 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionTitle eyebrow="Fonctionnalités" title="Tout ce qu'il faut pour bien gérer, et pour évoluer" text="Chaque logiciel dispose de sa base de données, de ses utilisateurs, de sa formation et de son lien permanent." />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} variant="zoom" delay={(i % 3) * 70} className="lift rounded-xl border border-slate-200 bg-white p-6">
                  <span className="icon-pop grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600">
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
                  <p className="faq-answer mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
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
        <div className="px-4 pb-3">
          <div className="flex h-16 items-end gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 pb-2 pt-3" aria-hidden>
            {[35, 55, 40, 70, 60, 85, 75].map((h, i) => (
              <span key={i} className="grow-bar flex-1 rounded-t bg-blue-500/80" style={{ height: `${h}%`, transitionDelay: `${300 + i * 90}ms` }} />
            ))}
          </div>
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
