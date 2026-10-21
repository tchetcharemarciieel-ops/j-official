import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { DemoStudio } from "./DemoStudio";

export const metadata = {
  title: "Démo sans compte",
  description: "Décrivez votre problème et essayez immédiatement un mini-logiciel généré, directement dans votre navigateur.",
};

export default function Demo() {
  return (
    <div className="bg-aurora min-h-dvh">
      <SiteHeader />
      <main id="contenu" className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        <Suspense>
          <DemoStudio />
        </Suspense>
      </main>
    </div>
  );
}
