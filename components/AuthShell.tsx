import { Logo } from "./Logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main id="contenu" className="bg-aurora flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo />
      <div className="glass mt-8 w-full max-w-md rounded-2xl p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
