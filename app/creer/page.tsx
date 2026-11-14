import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { projectLimit } from "@/lib/plans";
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
  // Nombre de logiciels selon la formule : limite atteinte, on propose la formule supérieure.
  if (!profile.is_admin) {
    const { limit, planName } = await projectLimit(profile.plan);
    const { data: owned } = await adminClient().from("projects").select("id,name").eq("owner_id", profile.id).order("created_at").limit(limit);
    if ((owned?.length ?? 0) >= limit) {
      const first = owned![0]!;
      return (
        <div className="bg-aurora min-h-dvh">
          <SiteHeader />
          <main id="contenu" className="mx-auto max-w-xl px-4 pb-28 pt-10 sm:px-6">
            <div className="glass rounded-2xl p-6 text-center">
              <h1 className="text-xl font-bold text-slate-900">{limit > 1 ? `Vous avez vos ${limit} logiciels` : "Vous avez déjà votre logiciel"}</h1>
              <p className="mt-2 text-sm text-slate-600">Votre formule {planName} permet {limit} logiciel{limit > 1 ? "s" : ""}. Pour en créer d&apos;autres, passez à une formule supérieure : Pro (5 logiciels), Business (20 logiciels)…</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link href="/espace/abonnement" className="btn btn-primary">Voir les formules</Link>
                <Link href={`/projets/${first.id}`} className="btn btn-ghost">Ouvrir « {first.name} »</Link>
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
