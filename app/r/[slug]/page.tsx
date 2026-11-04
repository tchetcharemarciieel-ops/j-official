import type { Metadata } from "next";
import { PublicMenu } from "@/components/public/PublicMenu";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; demo?: string }> };

export const metadata: Metadata = { title: "Menu du restaurant" };

/** Menu public du restaurant (QR code du menu général). */
export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  return <PublicMenu slug={slug} tableToken={null} menuToken={sp.q ?? null} demo={sp.demo === "1"} />;
}
