import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { draftSpec, getAccess, HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { saveVersion } from "@/lib/projects";
import { audit } from "@/lib/audit";
import { workspaceSchema } from "@/lib/spec";
import { buildWorkspace, sanitizeWorkspace } from "@/lib/workspace";

type Ctx = { params: Promise<{ id: string }> };

const settings = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  welcome: z.string().max(300).optional(),
  theme: z
    .object({
      primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      logoText: z.string().trim().max(4),
      logoUrl: z.string().url().startsWith("https://").max(500).optional().or(z.literal("")),
    })
    .optional(),
  /** Espace de travail 3D ; « reset » le recalcule selon le métier et les modules. */
  workspace: workspaceSchema.or(z.literal("reset")).optional(),
});

/** Modifications manuelles (couleurs, logo, textes) : nouvelle version testée. */
export const PATCH = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  const input = settings.parse(await readJson(req));
  const spec = draftSpec(project);
  if (!spec) throw new HttpError(409, "Le logiciel n'a pas encore été généré.");
  const next = structuredClone(spec);
  if (input.name) next.name = input.name;
  if (input.welcome !== undefined) next.welcome = input.welcome;
  if (input.theme) next.theme = { ...input.theme, logoUrl: input.theme.logoUrl || undefined };
  if (input.workspace) next.workspace = input.workspace === "reset" ? buildWorkspace(next) : sanitizeWorkspace(input.workspace, next);
  const summary = input.workspace ? "Espace de travail 3D (disposition, postes, modules visibles)" : "Personnalisation (couleurs, logo, textes)";
  const saved = await saveVersion(project, next, { summary, source: "manual", authorId: profile.id });
  return NextResponse.json({ version: saved.version, checks: saved.checks });
});

export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id, ["owner"]);
  const { confirm } = z.object({ confirm: z.string() }).parse(await readJson(req));
  if (confirm !== project.slug) throw new HttpError(400, "Saisissez l'identifiant du logiciel pour confirmer la suppression.");
  await adminClient().from("projects").delete().eq("id", id);
  await audit("project.deleted", { actorId: profile.id, level: "warning", details: { projectId: id, slug: project.slug } });
  return NextResponse.json({ ok: true });
});
