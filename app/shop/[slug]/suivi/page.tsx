import type { Metadata } from "next";
import { ShopTrack } from "@/components/shop/front/ShopTrack";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string; test?: string }> };

export const metadata: Metadata = { title: "Suivi de commande", robots: { index: false } };

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  return <ShopTrack slug={slug} token={sp.t && /^[A-Za-z0-9]{12,64}$/.test(sp.t) ? sp.t : null} test={sp.test === "1"} />;
}
