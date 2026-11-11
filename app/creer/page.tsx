import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { MAX_PROJECTS_PER_ACCOUNT } from "@/lib/config";
import { aiConfig, refreshAiSettings } from "@/lib/ai";
import { CREDIT_COSTS } from "@/lib/config";
import { SiteHeader } from "@/components/SiteHeader";
import { EspaceBottomNav } from "@/components/espace/EspaceNav";
import { CreateWizard } from "./CreateWizard";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Créer mon logiciel" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ probleme?: string }> }) {
  const { probleme } = await searchParams;
  const profile = await requireProfile(`/creer${probleme ? `?probleme=${encodeURIComponent(probleme)}` : ""}`);
  // Un seul logiciel par compte : si le compte en a déjà un, on l'y renvoie.
  if (!profile.is_admin) {
    const { data: owned } = await adminClient().from("projects").select("id,name").eq("owner_id", profile.id).order("created_at").limit(MAX_PROJECTS_PER_ACCOUNT);
    if ((owned?.length ?? 0) >= MAX_PROJECTS_PER_ACCOUNT) {
      const first = owned![0]!;
      return (
        <div className="bg-aurora min-h-dvh">
          <SiteHeader />
          <main id="contenu" className="mx-auto max-w-xl px-4 pb-28 pt-10 sm:px-6">
            <div className="glass rounded-2xl p-6 text-center">
              <h1 className="text-xl font-bold text-slate-900">Vous avez déjà votre logiciel</h1>
              <p className="mt-2 text-sm text-slate-600">Chaque compte peut créer un seul logiciel. Continuez avec « {first.name} » : vous pouvez le personnaliser à tout moment.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link href={`/projets/${first.id}`} className="btn btn-primary">Ouvrir mon logiciel</Link>
                <Link href="/espace" className="btn btn-ghost">Mon espace</Link>
              </div>
            </div>
          </main>
          <EspaceBottomNav />
        </div>
      );
    }
  }
  await refreshAiSettings();
  const cfg = aiConfig();
  const ai = cfg ? { label: cfg.label, model: cfg.model } : null;
  return (
    <div className="bg-aurora min-h-dvh">
      <SiteHeader />
      <main id="contenu" className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6 lg:pb-10">
        <Link href="/espace" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Retour à mon espace
        </Link>
        <CreateWizard initialProblem={(probleme ?? "").slice(0, 2000)} ai={ai} credits={profile.credits} costs={{ diagnose: ai ? CREDIT_COSTS.diagnose : 0 }} />
      </main>
      <EspaceBottomNav />
    </div>
  );
}
