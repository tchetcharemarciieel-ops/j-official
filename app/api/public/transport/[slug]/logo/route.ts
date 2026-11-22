import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { publicCompany, publicLogo } from "@/lib/transport/public";

type Ctx = { params: Promise<{ slug: string }> };
export const GET = route(async (req, { params }: Ctx) => {
  const { slug } = await params;
  const p = await publicCompany(slug, new URL(req.url).searchParams.get("test") === "1");
  const l = await publicLogo(p);
  if (!l) throw new HttpError(404, "Pas de logo.");
  return new Response(new Uint8Array(l.bytes), { headers: { "Content-Type": l.type, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300" } });
});
