import type { Metadata } from "next";
import { TransportFront } from "@/components/transport/front/TransportFront";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ n?: string; test?: string }> };
export const metadata: Metadata = { title: "Suivi de colis", robots: { index: false } };

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  return <TransportFront slug={slug} test={sp.test === "1"} tab="track" initialTracking={sp.n && /^TR[A-Za-z0-9]{9}$/.test(sp.n) ? sp.n.toUpperCase() : ""} />;
}
