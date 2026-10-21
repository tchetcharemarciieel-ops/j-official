import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./access";
import { serverConfigured } from "./config";

/** Enveloppe commune des routes API : erreurs lisibles, jamais de fuite de détails internes. */
export function route<C>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    if (!serverConfigured()) return NextResponse.json({ error: "Plateforme non configurée : base de données manquante." }, { status: 503 });
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError) return NextResponse.json({ error: "Données invalides.", details: err.issues.slice(0, 5).map((i) => `${i.path.join(".")} : ${i.message}`) }, { status: 400 });
      console.error(err);
      return NextResponse.json({ error: "Erreur serveur. Réessayez dans un instant." }, { status: 500 });
    }
  };
}

export async function readJson(req: Request, maxBytes = 1_000_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Requête trop volumineuse.");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "JSON invalide.");
  }
}

/** Protection CSRF simple : les requêtes d'écriture doivent venir du même site. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) throw new HttpError(403, "Origine refusée.");
}
