import Link from "next/link";
import { ArrowRight, BarChart3, Clock, Plus, Send, SquareStack, TriangleAlert } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { loadActivity, loadProjects } from "@/lib/espace";
import { fmtDateTime } from "@/lib/status";
import { LOW_CREDIT_THRESHOLD } from "@/lib/config";
import { StatCard } from "@/components/espace/StatCard";
import { ProjectCard } from "@/components/espace/ProjectCard";
import { WordsIn } from "@/components/espace/WordsIn";
import { Welcome } from "@/components/onboarding/Welcome";
import { loadOnboarding } from "@/lib/onboarding-store";

export const metadata = { title: "Vue d'ensemble" };
export const dynamic = "force-dynamic";

const IN_PROGRESS = ["preparation", "generation", "test", "failed"];

export default async function Overview() {
  const profile = await requireProfile("/espace");
  const projects = await loadProjects(profile);
  const ids = projects.map((p) => p.id);
  const managed = projects.filter((p) => p.role === "owner" || p.role === "admin").map((p) => p.id);
  const db = adminClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [activity, { data: views }, { count: records }, onboarding] = await Promise.all([
    loadActivity(ids, 12),
    ids.length ? db.from("app_views").select("views").in("project_id", ids).gte("day", since) : Promise.resolve({ data: [] as { views: number }[] }),
    managed.length ? db.from("records").select("id", { count: "exact", head: true }).in("project_id", managed).eq("is_demo", false) : Promise.resolve({ count: 0 }),
    loadOnboarding(profile.id).catch(() => null),
  ]);
  const name = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "—";
  const published = projects.filter((p) => p.status === "published").length;
  const inProgress = projects.filter((p) => IN_PROGRESS.includes(p.status)).length;
  const failed = projects.filter((p) => p.status === "failed").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end animate-fade-up">
        <div>
          <p className="text-sm text-slate-600">Vue d&apos;ensemble</p>
          <h1 className="font-display text-3xl font-bold text-slate-900"><WordsIn text={`Bonjour${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`} delay={80} /></h1>
          {profile.company_name && <p className="mt-1 text-sm text-slate-600">{profile.company_name}{profile.company_sector ? ` · ${profile.company_sector}` : ""}</p>}
        </div>
        <div className="flex gap-2">
          <Link href="/modeles" className="btn btn-ghost">Partir d&apos;un modèle</Link>
          <Link href="/creer" className="btn btn-primary"><Plus className="h-4 w-4" aria-hidden />Créer un logiciel</Link>
        </div>
      </div>

      {projects.length === 0 && <Welcome answers={onboarding} firstName={profile.full_name.split(" ")[0] ?? ""} />}

      {!profile.company_name && (
        <Link href="/espace/parametres" className="flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800 transition-colors hover:bg-blue-100 animate-fade-up">
          <span>Complétez le profil de votre entreprise (nom, logo, secteur, coordonnées).</span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      )}
      {profile.credits <= LOW_CREDIT_THRESHOLD && (
        <Link href="/espace/abonnement" className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          Il vous reste {profile.credits} crédit{profile.credits > 1 ? "s" : ""} IA. L&apos;analyse par règles reste gratuite.
        </Link>
      )}

      <section aria-label="Indicateurs" className="stagger grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Logiciels" value={projects.length} icon={SquareStack} hint={`${projects.filter((p) => p.role === "owner").length} créé(s) par vous`} href="/espace/logiciels" delay={0} />
        <StatCard label="En cours" value={inProgress} icon={Clock} hint={failed ? `dont ${failed} à corriger` : "préparation, génération ou test"} href="/espace/logiciels?statut=en-cours" tone="amber" delay={80} />
        <StatCard label="Publiés" value={published} icon={Send} hint="accessibles par leur lien" href="/espace/logiciels?statut=published" tone="green" delay={160} />
        <StatCard label="Visites (30 jours)" value={(views ?? []).reduce((a, v) => a + v.views, 0)} icon={BarChart3} hint={`${(records ?? 0).toLocaleString("fr-FR")} fiche(s) réelle(s) enregistrée(s)`} href="/espace/statistiques" tone="sky" delay={240} />
      </section>

      {projects.length === 0 ? (
        <section className="glass rounded-3xl p-10 text-center animate-fade-up">
          <h2 className="font-display text-2xl font-bold text-slate-900">Créez votre premier logiciel</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">Décrivez votre problème en une phrase : votre logiciel est prêt à tester en quelques minutes.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/creer" className="btn btn-primary">Créer mon premier logiciel</Link>
            <Link href="/demo" className="btn btn-ghost">Voir la démo</Link>
          </div>
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <section aria-labelledby="recents">
            <div className="flex items-center justify-between">
              <h2 id="recents" className="font-display text-xl font-semibold text-slate-900">Logiciels récents</h2>
              <Link href="/espace/logiciels" className="text-sm text-blue-700 hover:underline">Tout voir →</Link>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {projects.slice(0, 4).map((p, i) => <ProjectCard key={p.id} project={p} delay={i * 70} compact />)}
            </div>
          </section>
          <section aria-labelledby="activite" className="glass h-fit rounded-2xl p-5 animate-fade-up" style={{ animationDelay: "200ms" }}>
            <h2 id="activite" className="font-display text-lg font-semibold text-slate-900">Dernières activités</h2>
            {activity.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">Aucune activité pour l&apos;instant.</p>
            ) : (
              <ol className="timeline-draw stagger-x relative mt-4 space-y-4 border-l border-slate-200 pl-5">
                {activity.map((a, i) => (
                  <li key={i} className="relative">
                    <span style={{ animationDelay: `${300 + i * 90}ms` }} className={`dot-pop absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${a.level === "error" ? "bg-red-600" : a.level === "warning" ? "bg-amber-500" : "bg-blue-600"}`} />
                    <p className="text-sm text-slate-900">{a.label}</p>
                    <p className="text-xs text-slate-500">{name(a.project_id)} · {fmtDateTime(a.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
