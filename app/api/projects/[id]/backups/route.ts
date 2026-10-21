import { NextResponse } from "next/server";
import { assertSameOrigin, route } from "@/lib/api";
import { getAccess } from "@/lib/access";
import { createBackup } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  await createBackup(id, `Sauvegarde manuelle du ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Douala" })}`, profile.id, project.published_version);
  return NextResponse.json({ ok: true });
});
