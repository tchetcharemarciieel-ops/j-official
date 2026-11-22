import type { Metadata } from "next";
import { TransportFront } from "@/components/transport/front/TransportFront";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ test?: string }> };
export const metadata: Metadata = { title: "Demander une livraison", robots: { index: false } };

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  return <TransportFront slug={slug} test={sp.test === "1"} tab="request" initialTracking="" />;
}
