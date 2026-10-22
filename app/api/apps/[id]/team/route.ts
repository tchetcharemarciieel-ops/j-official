import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { getAccess } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/spec";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Membres du logiciel affichés dans l'espace de travail : nom et rôle uniquement,
 * visibles des seuls membres de ce logiciel (jamais d'adresse e-mail complète).
 */
export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  await getAccess(id);
  const db = adminClient();
  const { data: members } = await db.from("project_members").select("user_id,role").eq("project_id", id).limit(50);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const name = (uid: string) => {
    const p = (profiles ?? []).find((x) => x.id === uid);
    return (p?.full_name?.trim() || p?.email?.split("@")[0] || "Membre").slice(0, 40);
  };
  return NextResponse.json({ members: (members ?? []).map((m) => ({ id: m.user_id, name: name(m.user_id), role: m.role as Role })) });
});
