import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { adminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { parseSpec, type Role } from "@/lib/spec";
import { serverConfigured } from "@/lib/config";
import { AppRuntime } from "@/components/runtime/AppRuntime";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!serverConfigured() || !/^[a-z0-9-]{3,61}$/.test(slug)) return null;
  const { data } = await adminClient().from("projects").select("id,name,slug,status,published_spec,published_version").eq("slug", slug).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p?.published_spec) return { title: "Logiciel introuvable" };
  const spec = parseSpec(p.published_spec);
  return {
    title: { absolute: p.name },
    manifest: `/apps/${slug}/manifest.webmanifest`,
    robots: { index: false },
    themeColor: spec.ok ? spec.spec.theme.primary : undefined,
  } as Metadata;
}

function Notice({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-slate-900">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{text}</p>
        {children}
        <p className="mt-6 text-xs text-slate-600">Propulsé par <Link href="/" className="underline">MiniSoft RCA</Link></p>
      </div>
    </main>
  );
}

/** Logiciel publié : lien permanent, données réelles, accès réservé aux membres invités. */
export default async function PublishedApp({ params }: Props) {
  const { slug } = await params;
  const project = await load(slug);
  if (!project || !project.published_spec) notFound();
  const profile = await getProfile();
  if (!profile) redirect(`/connexion?next=/apps/${slug}`);
  if (profile.suspended) redirect("/compte-suspendu");
  const db = adminClient();
  const { data: member } = await db.from("project_members").select("role").eq("project_id", project.id).eq("user_id", profile.id).maybeSingle();
  if (!member)
    return (
      <Notice title="Accès non autorisé" text={`Votre compte (${profile.email}) n'a pas été invité dans « ${project.name} ». Demandez une invitation au propriétaire du logiciel.`}>
        <form action="/auth/signout" method="post" className="mt-4">
          <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Changer de compte</button>
        </form>
      </Notice>
    );
  const role = member.role as Role;
  if (project.status === "suspended" && role !== "owner" && role !== "admin") return <Notice title="Logiciel suspendu" text="Ce logiciel a été suspendu. Vos données sont conservées ; contactez son propriétaire." />;
  const spec = parseSpec(project.published_spec);
  if (!spec.ok) return <Notice title="Logiciel indisponible" text="La version publiée est invalide. Le propriétaire doit la republier." />;
  await db.rpc("track_view", { pid: project.id });
  return (
    <>
      {project.status === "suspended" && <p className="no-print bg-red-600 px-4 py-2 text-center text-sm text-white">Publication suspendue : seuls le propriétaire et les administrateurs y ont accès.</p>}
      <AppRuntime projectId={project.id} spec={spec.spec} mode="live" role={role} />
    </>
  );
}
