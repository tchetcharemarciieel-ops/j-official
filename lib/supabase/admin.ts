import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

/**
 * Sans clé service_role dans l'hébergeur, les requêtes passent par la passerelle
 * Supabase « server-gateway », qui détient la clé et n'accepte que la clé de passerelle.
 */
function gatewayFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
  const target = `${base}/functions/v1/server-gateway${url.pathname}${url.search}`;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("x-gateway-key", process.env.SUPABASE_GATEWAY_KEY!);
  return fetch(target, { ...init, headers });
}

/**
 * Client service_role : contourne la RLS. À n'utiliser qu'après avoir vérifié
 * l'identité et les droits de l'utilisateur (voir lib/access.ts).
 */
export function adminClient(): SupabaseClient {
  if (!admin) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    admin = serviceKey
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: gatewayFetch },
        });
  }
  return admin;
}
