import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-white" aria-label="MiniSoft RCA — accueil">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-sky-glow text-sm shadow-lg shadow-brand-500/40">MS</span>
      <span>
        MiniSoft <span className="text-brand-300">RCA</span>
      </span>
    </Link>
  );
}
