import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { loadProjects } from "@/lib/espace";
import { ProjectsBoard } from "@/components/espace/ProjectsBoard";

export const metadata = { title: "Mes logiciels" };
export const dynamic = "force-dynamic";

export default async function MesLogiciels({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const profile = await requireProfile("/espace/logiciels");
  const [{ statut }, projects] = await Promise.all([searchParams, loadProjects(profile)]);
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end animate-fade-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Mes logiciels</h1>
          <p className="mt-1 text-sm text-slate-400">Ouvrez, modifiez, testez, publiez et partagez vos mini-logiciels.</p>
        </div>
        <Link href="/creer" className="btn btn-primary">✨ Créer un logiciel</Link>
      </div>
      <ProjectsBoard projects={projects} initialFilter={statut} />
    </div>
  );
}
