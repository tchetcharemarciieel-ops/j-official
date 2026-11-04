import type { Metadata } from "next";
import { PublicMenu } from "@/components/public/PublicMenu";

type Props = { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ demo?: string }> };

export const metadata: Metadata = { title: "Menu", robots: { index: false, follow: false } };

/** Menu d'une table : le jeton secret du QR code identifie la table (le client ne peut pas la changer). */
export default async function Page({ params, searchParams }: Props) {
  const { slug, token } = await params;
  const sp = await searchParams;
  return <PublicMenu slug={slug} tableToken={token} menuToken={null} demo={sp.demo === "1"} />;
}
