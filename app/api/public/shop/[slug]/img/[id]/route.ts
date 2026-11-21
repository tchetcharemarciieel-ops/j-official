import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { clientIp } from "@/lib/client-ip";
import { publicImage, publicShop } from "@/lib/shop/public";
import { limited } from "@/lib/venue/public";

type Ctx = { params: Promise<{ slug: string; id: string }> };

/** Image publique (photo d'un produit visible, logo, bannière) ; toute autre image est refusée. */
export const GET = route(async (req, { params }: Ctx) => {
  const { slug, id } = await params;
  if (limited(`shop-img:${clientIp(req)}`, 300)) throw new HttpError(429, "Trop de requêtes.");
  const p = await publicShop(slug, new URL(req.url).searchParams.get("test") === "1");
  const img = await publicImage(p, id);
  if (!img) throw new HttpError(404, "Image introuvable.");
  return new Response(new Uint8Array(img.bytes), { headers: { "Content-Type": img.type, "Cache-Control": p.demo ? "private, no-store" : "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
});
