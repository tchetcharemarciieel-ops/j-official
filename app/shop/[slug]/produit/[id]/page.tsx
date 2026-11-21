import type { Metadata } from "next";
import { ShopFront } from "@/components/shop/front/ShopFront";

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ test?: string }> };

export const metadata: Metadata = { title: "Produit" };

/** Page détail d'un produit (lien partageable) : même boutique, produit ouvert. */
export default async function Page({ params, searchParams }: Props) {
  const { slug, id } = await params;
  const sp = await searchParams;
  return <ShopFront slug={slug} test={sp.test === "1"} initialProduct={/^[0-9a-f-]{36}$/i.test(id) ? id : null} />;
}
