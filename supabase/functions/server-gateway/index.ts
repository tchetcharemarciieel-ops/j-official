// Passerelle serveur MiniSoft RCA.
// Permet au serveur de l'application (Render) d'utiliser les droits « service_role »
// sans que la clé secrète Supabase ne quitte Supabase. Seul un appelant qui connaît la clé
// de passerelle (dont seule l'empreinte SHA-256 figure ici) peut l'utiliser.
// Chemins autorisés : API de données (/rest/v1/) et administration des comptes (/auth/v1/admin/).

const GATEWAY_KEY_SHA256 = "c08d3efc164e0f2f7e17204bb2272f05ad3e0b18e9ec3ec1e09b4e9de6635abe";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PREFIX = "/server-gateway";
const ALLOWED = [/^\/rest\/v1\//, /^\/auth\/v1\/admin\//];

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const key = req.headers.get("x-gateway-key") ?? "";
  if (!key || !sameHex(await sha256(key), GATEWAY_KEY_SHA256)) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const i = url.pathname.indexOf(PREFIX);
  const path = i >= 0 ? url.pathname.slice(i + PREFIX.length) : url.pathname;
  if (!ALLOWED.some((re) => re.test(path)) || path.includes("..")) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  for (const [k, v] of req.headers) {
    const lower = k.toLowerCase();
    if (["accept", "content-type", "prefer", "range", "accept-profile", "content-profile", "x-client-info"].includes(lower)) headers.set(k, v);
  }
  headers.set("apikey", SERVICE_KEY);
  headers.set("authorization", `Bearer ${SERVICE_KEY}`);

  const upstream = await fetch(`${SUPABASE_URL}${path}${url.search}`, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
  });
  const out = new Headers();
  for (const k of ["content-type", "content-range", "preference-applied"]) {
    const v = upstream.headers.get(k);
    if (v) out.set(k, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
});
