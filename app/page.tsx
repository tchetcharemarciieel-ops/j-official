import { siteHref, STATIC_SITE } from "@/lib/site-mode";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { HeroPrompt } from "@/components/HeroPrompt";
import { BuildDemo } from "@/components/BuildDemo";
import { Reveal } from "@/components/Reveal";
import { TEMPLATES } from "@/lib/templates";
import { SECTORS } from "@/lib/generator";
import { getPlans, xaf } from "@/lib/plans";
import { CREDIT_COSTS, SITE_URL } from "@/lib/config";
import { LeadForm } from "@/components/LeadForm";
import { PromoVideo } from "@/components/PromoVideo";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "1", title: "Décrivez votre besoin", text: "En français, à l'écrit ou à la voix. Joignez si besoin un fichier Excel/CSV ou une photo de votre cahier.", icon: "💬" },
  { n: "2", title: "L'IA construit votre solution", text: "Diagnostic, cahier des charges modifiable, tables, formulaires, tableau de bord et tests automatiques.", icon: "⚙️" },
  { n: "3", title: "Utilisez et partagez votre logiciel", text: "Testez l'aperçu, publiez, puis partagez le lien avec vos employés autorisés.", icon: "🚀" },
];

const FEATURES = [
  { icon: "🩺", title: "Diagnostic intelligent", text: "Problème principal, tâches manuelles, données à conserver, utilisateurs, automatisations et limites — avant toute génération." },
  { icon: "🧩", title: "Composants validés", text: "Chaque logiciel est assemblé à partir de composants testés : pas de code arbitraire exécuté, donc fiable et sûr." },
  { icon: "🗣️", title: "Modifications par conversation", text: "« Ajoute un champ téléphone », « Change les couleurs en vert » : aperçu avant/après, puis application." },
  { icon: "🧪", title: "Tests automatiques", text: "Formulaires, calculs, permissions, base de données et isolation entre clients vérifiés avant publication." },
  { icon: "🔗", title: "Lien permanent", text: "Votre logiciel publié sur une adresse unique, ouverte dans Chrome sur téléphone et ordinateur." },
  { icon: "👥", title: "Équipe et rôles", text: "Propriétaire, administrateur, gestionnaire, employé, lecteur : droits vérifiés côté serveur." },
  { icon: "🕓", title: "Versions et sauvegardes", text: "Historique, comparaison, restauration de la structure, sauvegardes de vos données." },
  { icon: "📈", title: "Assistant de données", text: "« Combien ai-je vendu cette semaine ? » : réponses calculées sur vos données, sans chiffre inventé." },
];

const FAQ = [
  { q: "Comment créer mon mini-logiciel ?", a: "Cliquez sur « Créer mon logiciel », décrivez votre problème et répondez aux quelques questions posées. Vous validez ensuite le plan proposé (fonctionnalités à garder ou retirer), puis le logiciel est généré et testé. Vous pouvez aussi partir d'un modèle." },
  { q: "Dois-je savoir programmer ?", a: "Non. Tout se fait en français, par formulaires et par conversation. Le logiciel est assemblé à partir de composants déjà testés." },
  { q: "Puis-je utiliser mon logiciel dans Chrome ?", a: "Oui. Un logiciel publié s'ouvre depuis son lien dans Chrome (et les autres navigateurs récents), sur ordinateur, tablette et téléphone. Il peut aussi être ajouté à l'écran d'accueil." },
  { q: "Puis-je partager mon lien ?", a: "Oui, avec les personnes que vous invitez. Le lien est permanent, mais l'accès aux données exige que la personne soit connectée et invitée dans votre logiciel avec un rôle." },
  { q: "Puis-je modifier mon logiciel après sa création ?", a: "Oui, par l'assistant intégré ou par les paramètres (couleurs, logo, textes). Chaque modification crée une nouvelle version testée ; vos données existantes sont conservées et vous pouvez revenir à une version précédente." },
  { q: "Mes données sont-elles privées ?", a: "Oui. Chaque logiciel a ses propres données, séparées par des règles d'accès dans la base. Chaque action est vérifiée côté serveur selon votre rôle : changer une adresse web ne donne jamais accès aux données d'un autre client." },
  { q: "Puis-je utiliser mon logiciel sur téléphone ?", a: "Oui, l'interface s'adapte aux petits écrans. Sans connexion Internet, les nouvelles fiches saisies sont gardées temporairement sur l'appareil et envoyées au retour du réseau ; la consultation et les fonctions IA nécessitent Internet." },
  { q: "Combien coûte la création ?", a: `La formule Découverte est gratuite (crédits limités, sans publication). Une analyse IA coûte ${CREDIT_COSTS.diagnose} crédits et une modification IA ${CREDIT_COSTS.modify} crédits. Les formules payantes sont affichées ci-dessus en FCFA.` },
  { q: "Puis-je annuler mon abonnement ?", a: "Le paiement en ligne n'est pas encore activé : aucun prélèvement n'est effectué. Le passage à une formule payante se fait aujourd'hui avec l'équipe MiniSoft RCA, et peut être arrêté à tout moment." },
  { q: "Que se passe-t-il si la génération échoue ?", a: "Les crédits réservés sont intégralement remboursés, l'erreur est affichée avec une explication, et le projet passe au statut « Échec nécessitant une correction ». Les tests proposent des corrections automatiques quand c'est possible." },
];

export default async function Home() {
  const plans = await getPlans();
  return (
    <div className="bg-aurora">
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
              mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ]).replace(/</g, "\\u003c"),
        }}
      />
      <SiteHeader />
      <main id="contenu">
        {/* Section principale */}
        <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
          <div className="pointer-events-none absolute left-1/2 top-24 -z-0 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-500/30 blur-3xl animate-pulse-glow" />
          <div className="relative mx-auto max-w-5xl text-center">
            <Reveal>
              <p className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Restaurants, garages, pharmacies, écoles, hôtels, PME…
              </p>
              <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
                <span className="text-gradient">Votre problème mérite son propre logiciel.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">Décrivez votre problème. Notre IA conçoit un mini-logiciel adapté à votre entreprise, sans que vous ayez besoin de programmer.</p>
            </Reveal>
            <Reveal delay={150}>
              <HeroPrompt />
              <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate-300" aria-label="Points clés">
                {["Gratuit pour commencer", "Sans carte bancaire", "En français", "Montants en FCFA", "Téléphone et ordinateur"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span>{t}</li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* Vidéo de présentation animée */}
        <section id="video" className="scroll-mt-20 px-4 pb-8 sm:px-6">
          <Reveal>
            <PromoVideo />
          </Reveal>
        </section>

        {/* Avant / après */}
        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Reveal className="text-center">
              <h2 className="font-display text-3xl font-bold sm:text-4xl">Du cahier au logiciel</h2>
              <p className="mx-auto mt-3 max-w-2xl text-slate-400">Ce qui change dans votre journée, concrètement.</p>
            </Reveal>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <Reveal className="rounded-2xl border border-red-400/20 bg-red-500/5 p-6">
                <h3 className="font-semibold text-red-200">Aujourd&apos;hui</h3>
                <ul className="mt-4 space-y-3 text-slate-300">
                  {["Les commandes et les ventes sont notées sur un cahier qui se perd ou s'abîme.", "Vous découvrez une rupture de stock quand le client est devant vous.", "Pour connaître le chiffre du mois, il faut tout recompter à la main.", "Vos employés vous appellent pour savoir où en est un dossier.", "Les logiciels du marché sont chers, en anglais ou trop compliqués."].map((t) => <li key={t} className="flex gap-2"><span className="text-red-300">✗</span>{t}</li>)}
                </ul>
              </Reveal>
              <Reveal delay={100} className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-6">
                <h3 className="font-semibold text-emerald-200">Avec MiniSoft RCA</h3>
                <ul className="mt-4 space-y-3 text-slate-300">
                  {["Chaque fiche est enregistrée en ligne, retrouvable en une recherche.", "Les produits sous le seuil apparaissent sur le tableau de bord.", "Les totaux du mois en FCFA sont calculés automatiquement.", "Chaque employé consulte ce dont il a besoin, avec des droits limités.", "Un logiciel en français, fait pour votre métier, modifiable en le demandant."].map((t) => <li key={t} className="flex gap-2"><span className="text-emerald-300">✓</span>{t}</li>)}
                </ul>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Étapes + illustration */}
        <section id="comment" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
            <div>
              <Reveal>
                <h2 className="font-display text-3xl font-bold sm:text-4xl">Comment ça marche</h2>
                <p className="mt-3 text-slate-400">Trois étapes, du problème au logiciel en ligne.</p>
              </Reveal>
              <ol className="mt-8 space-y-4">
                {STEPS.map((s, i) => (
                  <Reveal as="li" key={s.n} delay={i * 120} className="glass flex gap-4 rounded-2xl p-5 transition hover:border-brand-400/40">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500/40 to-sky-glow/30 text-xl">{s.icon}</span>
                    <div>
                      <h3 className="font-semibold text-white">
                        {s.n}. {s.title}
                      </h3>
                      <p className="mt-1 text-sm text-slate-400">{s.text}</p>
                    </div>
                  </Reveal>
                ))}
              </ol>
            </div>
            <Reveal delay={200}>
              <BuildDemo />
            </Reveal>
          </div>
        </section>

        {/* Fonctionnalités */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <Reveal className="text-center">
              <h2 className="font-display text-3xl font-bold sm:text-4xl">Une vraie plateforme, pas une maquette</h2>
              <p className="mx-auto mt-3 max-w-2xl text-slate-400">Chaque bouton a une action réelle. Chaque logiciel a sa base de données, ses permissions et son lien.</p>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 4) * 80} className="glass group rounded-2xl p-5 transition duration-300 hover:-translate-y-1 hover:border-brand-400/40">
                  <div className="text-2xl transition group-hover:scale-110">{f.icon}</div>
                  <h3 className="mt-3 font-semibold text-white">{f.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{f.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Exemples */}
        <section id="exemples" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <Reveal className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="font-display text-3xl font-bold sm:text-4xl">Un logiciel pour votre métier</h2>
                <p className="mt-3 text-slate-400">Choisissez votre secteur pour voir ce que votre logiciel contiendra.</p>
              </div>
              <Link href="/modeles" className="btn btn-ghost">
                Voir tous les modèles →
              </Link>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {TEMPLATES.map((t, i) => (
                <Reveal key={t.id} delay={(i % 5) * 60}>
                  <Link href={`/secteurs/${t.id}`} className="glass block h-full rounded-2xl p-4 transition hover:-translate-y-1 hover:border-brand-400/40">
                    <span className="text-2xl">{SECTORS[t.sector]?.icon}</span>
                    <h3 className="mt-2 text-sm font-semibold text-white">{t.name}</h3>
                    <p className="mt-1 text-xs text-slate-400">{t.description}</p>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Sécurité */}
        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Reveal className="text-center">
              <h2 className="font-display text-3xl font-bold sm:text-4xl">Vos données restent les vôtres</h2>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["🔒", "Séparées par entreprise", "Chaque logiciel a ses propres données. Un autre client ne peut pas les voir, même en modifiant une adresse web."],
                ["👤", "Accès sur invitation", "Seules les personnes que vous invitez accèdent à votre logiciel, avec le rôle que vous choisissez."],
                ["💾", "Sauvegardes", "Une sauvegarde est faite avant chaque changement important, et vous pouvez en créer à tout moment."],
                ["📤", "Export libre", "Exportez vos fiches en Excel (CSV) ou en PDF quand vous voulez."],
              ].map(([icon, title, text], i) => (
                <Reveal key={title} delay={i * 80} className="glass rounded-2xl p-5">
                  <p className="text-2xl">{icon}</p>
                  <h3 className="mt-2 font-semibold text-white">{title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Tarifs */}
        <section id="tarifs" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <Reveal className="text-center">
              <h2 className="font-display text-3xl font-bold sm:text-4xl">Tarifs</h2>
              {STATIC_SITE && <p className="mx-auto mt-3 max-w-2xl rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm text-sky-100">Les comptes et les formules ouvriront avec la version complète. En attendant, la démo est gratuite et sans inscription.</p>}
              <p className="mx-auto mt-3 max-w-2xl text-slate-400">Prix mensuels en FCFA (XAF). Les crédits servent aux opérations IA ; une opération IA échouée est remboursée.</p>
            </Reveal>
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((p, i) => (
                <Reveal key={p.id} delay={i * 80} className={`glass flex flex-col rounded-2xl p-6 ${p.id === "pro" ? "glow-ring" : ""}`}>
                  {p.id === "pro" && <span className="mb-3 self-start rounded-full bg-brand-500/30 px-3 py-1 text-xs text-brand-300">Le plus choisi</span>}
                  <h3 className="font-display text-xl font-semibold text-white">{p.name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{p.description}</p>
                  <p className="mt-5 font-display text-3xl font-bold text-white">
                    {p.price_xaf === 0 ? "Gratuit" : xaf(p.price_xaf)}
                    {p.price_xaf > 0 && <span className="text-sm font-normal text-slate-400"> / mois</span>}
                  </p>
                  <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-300">
                    <li>✓ {p.monthly_credits} crédits IA par mois</li>
                    <li>✓ {p.max_projects} logiciel{p.max_projects > 1 ? "s" : ""}</li>
                    <li>✓ {p.max_members} utilisateur{p.max_members > 1 ? "s" : ""} par logiciel</li>
                    <li>{p.can_publish ? "✓ Publication avec lien permanent" : "✗ Pas de publication (aperçu uniquement)"}</li>
                    <li>✓ Tests automatiques, versions, exports</li>
                  </ul>
                  <Link href={siteHref(p.price_xaf === 0 ? "/inscription" : "/espace/abonnement")} className={`btn mt-6 ${p.id === "pro" ? "btn-primary" : "btn-ghost"}`}>
                    {p.price_xaf === 0 ? "Commencer gratuitement" : "Choisir cette formule"}
                  </Link>
                </Reveal>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-slate-500">
              Coûts IA : analyse {CREDIT_COSTS.diagnose} crédits · modification {CREDIT_COSTS.modify} crédits · question à l&apos;assistant {CREDIT_COSTS.ask} crédit. Le paiement en ligne n&apos;est pas encore activé : aucun prélèvement sans votre confirmation.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <Reveal className="text-center">
              <h2 className="font-display text-3xl font-bold sm:text-4xl">Questions fréquentes</h2>
            </Reveal>
            <div className="mt-10 space-y-3">
              {FAQ.map((f) => (
                <Reveal key={f.q}>
                  <details className="glass group rounded-2xl p-5 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-white">
                      {f.q}
                      <span className="text-brand-300 transition group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-slate-300">{f.a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {!STATIC_SITE && (
          <section id="demonstration" className="scroll-mt-20 px-4 py-16 sm:px-6">
            <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_1.3fr]">
              <Reveal>
                <h2 className="font-display text-3xl font-bold">Parlons de votre entreprise</h2>
                <p className="mt-3 text-slate-300">Laissez vos coordonnées : nous vous montrons en direct le logiciel adapté à votre activité. Gratuit et sans engagement.</p>
                <ul className="mt-5 space-y-2 text-sm text-slate-400">
                  <li>✓ Démonstration avec vos propres exemples</li>
                  <li>✓ Aide à l&apos;import de vos fichiers Excel</li>
                  <li>✓ Conseils pour équiper vos employés</li>
                </ul>
              </Reveal>
              <Reveal delay={100} className="glass rounded-2xl p-6">
                <LeadForm source="accueil" />
              </Reveal>
            </div>
          </section>
        )}

        <section className="px-4 pb-24 sm:px-6">
          <Reveal className="glass glow-ring mx-auto max-w-4xl rounded-3xl p-8 text-center sm:p-12">
            <h2 className="font-display text-3xl font-bold">Prêt à créer votre logiciel ?</h2>
            <p className="mt-3 text-slate-300">Décrivez votre problème : le diagnostic est prêt en quelques instants.</p>
            <Link href={siteHref("/creer")} className="btn btn-primary mt-6">
              Créer mon mini-logiciel avec l&apos;IA
            </Link>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
