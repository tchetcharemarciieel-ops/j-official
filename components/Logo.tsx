import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900" aria-label="MiniSoft RCA — accueil">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">MS</span>
      <span>
        MiniSoft <span className="text-blue-600">RCA</span>
      </span>
    </Link>
  );
}
