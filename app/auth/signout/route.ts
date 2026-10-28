import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Page de retour facultative (chemin interne uniquement), par exemple /inscription.
  const form = await request.formData().catch(() => null);
  const next = String(form?.get("next") ?? "/");
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}
