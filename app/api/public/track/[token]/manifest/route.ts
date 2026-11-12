import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Manifeste propre au suivi d'une commande : ajoutée à l'écran d'accueil (iPhone), l'icône rouvre
 * directement ce suivi, ce qui permet les notifications écran verrouillé.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  const url = new URL(req.url);
  const slug = (url.searchParams.get("r") ?? "").slice(0, 70);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !/^[a-z0-9-]{1,70}$/i.test(slug)) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  const path = `/r/${slug}/suivi/${token}${url.searchParams.get("demo") === "1" ? "?demo=1" : ""}`;
  return NextResponse.json(
    {
      name: "Suivi de commande",
      short_name: "Ma commande",
      start_url: path,
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#0B1B3F",
      icons: [
        { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } },
  );
}
