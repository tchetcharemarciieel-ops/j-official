import { adminClient } from "@/lib/supabase/admin";
import { parseSpec } from "@/lib/spec";
import { serverConfigured } from "@/lib/config";

type Ctx = { params: Promise<{ slug: string }> };

/** Manifeste PWA propre à chaque logiciel publié (installation sur l'écran d'accueil). */
export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!serverConfigured() || !/^[a-z0-9-]{3,61}$/.test(slug)) return new Response("Not found", { status: 404 });
  const { data } = await adminClient().from("projects").select("name,published_spec").eq("slug", slug).maybeSingle();
  const spec = data?.published_spec ? parseSpec(data.published_spec) : null;
  if (!data || !spec?.ok) return new Response("Not found", { status: 404 });
  return Response.json(
    {
      name: data.name,
      short_name: data.name.slice(0, 12),
      start_url: `/apps/${slug}`,
      scope: `/apps/${slug}`,
      display: "standalone",
      background_color: "#f8fafc",
      theme_color: spec.spec.theme.primary,
      icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
