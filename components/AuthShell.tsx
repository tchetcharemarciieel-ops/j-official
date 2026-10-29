import { Logo } from "./Logo";

export function AuthShell({ title, subtitle, children, wide = false }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <main id="contenu" className="bg-aurora flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo />
      <div className={`glass mt-8 w-full rounded-2xl p-5 sm:p-8 ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <h1 className="font-display text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
