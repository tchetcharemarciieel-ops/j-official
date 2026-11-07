import Link from "next/link";
import { getSetting } from "@/lib/settings";

/** Logo de la plateforme : nom et image réglables dans l'administration. */
export async function Logo({ href = "/" }: { href?: string }) {
  const b = await getSetting("branding");
  const [first, ...rest] = b.name.split(" ");
  return (
    <Link href={href} className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900" aria-label={`${b.name} — accueil`}>
      {b.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" referrerPolicy="no-referrer" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/brand/minisoft-icone.svg" alt="" className="h-9 w-9 rounded-lg" />
      )}
      <span>
        {first} {rest.length > 0 && <span style={{ color: "var(--brand, #2563eb)" }}>{rest.join(" ")}</span>}
      </span>
    </Link>
  );
}
