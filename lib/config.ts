export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function serverConfigured(): boolean {
  return supabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_GATEWAY_KEY);
}

/** Coût en crédits des opérations IA (configurable par variables d'environnement). */
export const CREDIT_COSTS = {
  diagnose: Number(process.env.CREDITS_DIAGNOSE || 2),
  generate: Number(process.env.CREDITS_GENERATE || 3),
  modify: Number(process.env.CREDITS_MODIFY || 2),
  ask: Number(process.env.CREDITS_ASK || 1),
} as const;

export const LOW_CREDIT_THRESHOLD = 5;

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
