import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: { secure: typeof location !== "undefined" && location.protocol === "https:", sameSite: "lax", path: "/" } });
}
