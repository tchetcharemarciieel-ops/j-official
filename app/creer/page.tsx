import { requireProfile } from "@/lib/auth";
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
