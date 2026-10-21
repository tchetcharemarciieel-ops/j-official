import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ slug: string }> };

/** État public d'une publication (sans aucune donnée métier) : sert à vérifier un lien. */
export const GET = route(async (_req, { params }: Ctx) => {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,61}$/.test(slug)) return NextResponse.json({ status: "not_found" }, { status: 404 });
  const { data } = await adminClient().from("projects").select("status,published_version,published_at").eq("slug", slug).maybeSingle();
  if (!data || !data.published_version) return NextResponse.json({ status: "not_found" }, { status: 404 });
  return NextResponse.json({ status: data.status === "published" ? "online" : "suspended", version: data.published_version, publishedAt: data.published_at });
});
