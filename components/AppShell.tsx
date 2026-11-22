import { SiteHeader } from "./SiteHeader";

export function AppShell({ children, wide, noMenu }: { children: React.ReactNode; wide?: boolean; noMenu?: boolean }) {
  return (
    <div className="bg-aurora min-h-dvh">
      <SiteHeader noMenu={noMenu} />
      <main id="contenu" className={`mx-auto px-4 py-8 sm:px-6 ${wide ? "max-w-[1400px]" : "max-w-6xl"}`}>
        {children}
      </main>
    </div>
  );
}
