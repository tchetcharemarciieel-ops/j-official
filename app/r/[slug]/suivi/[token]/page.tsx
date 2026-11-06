import type { Metadata } from "next";
import { OrderTracking } from "@/components/public/OrderTracking";

type Props = { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ demo?: string; nouveau?: string; s?: string; zperr?: string }> };

export const metadata: Metadata = { title: "Suivi de commande", robots: { index: false, follow: false } };

/** Suivi de commande par lien secret (accessible même après la fermeture du menu). */
export default async function Page({ params, searchParams }: Props) {
  const { slug, token } = await params;
  const sp = await searchParams;
  return <OrderTracking slug={slug} token={token} demo={sp.demo === "1"} fresh={sp.nouveau === "1"} sessionKey={sp.s?.startsWith("msr:session:") ? sp.s.slice(0, 200) : null} payError={sp.zperr ? sp.zperr.slice(0, 200) : null} />;
}
