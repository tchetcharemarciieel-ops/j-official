import { requireProfile } from "@/lib/auth";
import { aiConfig } from "@/lib/ai";
import { CREDIT_COSTS } from "@/lib/config";
import { SiteHeader } from "@/components/SiteHeader";
import { CreateWizard } from "./CreateWizard";

export const metadata = { title: "Créer mon logiciel" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ probleme?: string }> }) {
  const { probleme } = await searchParams;
  const profile = await requireProfile(`/creer${probleme ? `?probleme=${encodeURIComponent(probleme)}` : ""}`);
  const cfg = aiConfig();
  const ai = cfg ? { label: cfg.label, model: cfg.model } : null;
  return (
    <div className="bg-aurora min-h-dvh">
      <SiteHeader />
      <main id="contenu" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <CreateWizard initialProblem={(probleme ?? "").slice(0, 2000)} ai={ai} credits={profile.credits} costs={{ diagnose: ai ? CREDIT_COSTS.diagnose : 0 }} />
      </main>
    </div>
  );
}
