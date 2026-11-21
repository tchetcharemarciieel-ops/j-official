import type { Metadata } from "next";
import { ShopFront } from "@/components/shop/front/ShopFront";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ test?: string }> };

export const metadata: Metadata = { title: "Boutique en ligne", description: "Découvrez les produits et commandez en ligne." };

/** Vitrine publique d'une boutique MiniSoft Shop : accessible sans compte. */
export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  return <ShopFront slug={slug} test={sp.test === "1"} />;
}
