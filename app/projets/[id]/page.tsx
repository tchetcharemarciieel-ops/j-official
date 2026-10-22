import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { draftSpec, publishedSpec, type ProjectRow } from "@/lib/access";
import { aiAvailable, refreshAiSettings } from "@/lib/ai";
import { CREDIT_COSTS, SITE_URL } from "@/lib/config";
import type { Role } from "@/lib/spec";
import { AppShell } from "@/components/AppShell";
import { Workspace, type WorkspaceData } from "./Workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon logiciel" };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ onglet?: string }> }) {
  const { id } = await params;
  await refreshAiSettings();
  const { onglet } = await searchParams;
  const profile = await requireProfile(`/projets/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = adminClient();
  const [{ data: project }, { data: member }] = await Promise.all([
    db.from("projects").select("*").eq("id", id).maybeSingle(),
    db.from("project_members").select("role").eq("project_id", id).eq("user_id", profile.id).maybeSingle(),
  ]);
  if (!project || !member) notFound();
  const role = member.role as Role;
  if (role !== "owner" && role !== "admin") {
    if (project.published_spec) redirect(`/apps/${project.slug}`);
    notFound();
  }
  const p = project as ProjectRow;
  const [versions, members, invitations, integrations, backups, history, logs, plan] = await Promise.all([
    db.from("project_versions").select("version,spec,summary,changes,test_report,author_id,source,published,created_at").eq("project_id", id).order("version", { ascending: false }).limit(30),
    db.from("project_members").select("user_id,role,created_at").eq("project_id", id),
    db.from("invitations").select("id,email,role,expires_at,created_at").eq("project_id", id).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()),
    db.from("integrations").select("id,label,type,status,last_error,last_tested_at,config").eq("project_id", id),
    db.from("backups").select("id,label,record_count,created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("record_history").select("entity,action,actor_id,created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("audit_logs").select("action,level,actor_id,details,created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("plans").select("name,can_publish,max_members").eq("id", profile.plan).single(),
  ]);
  const userIds = Array.from(new Set([...(members.data ?? []).map((m) => m.user_id), ...(versions.data ?? []).map((v) => v.author_id), ...(logs.data ?? []).map((l) => l.actor_id), ...(history.data ?? []).map((h) => h.actor_id)].filter(Boolean)));
  const { data: people } = userIds.length ? await db.from("profiles").select("id,email,full_name").in("id", userIds) : { data: [] };
  const who = Object.fromEntries((people ?? []).map((x) => [x.id, x.full_name || x.email]));

  const data: WorkspaceData = {
    project: { id: p.id, name: p.name, slug: p.slug, status: p.status, sector: p.sector, problem: p.problem, draftVersion: p.draft_version, publishedVersion: p.published_version, publishedAt: p.published_at, lastError: p.last_error, createdAt: p.created_at },
    spec: draftSpec(p),
    published: publishedSpec(p),
    diagnosis: p.diagnosis as WorkspaceData["diagnosis"],
    role,
    meId: profile.id,
    ai: aiAvailable(),
    costs: { modify: aiAvailable() ? CREDIT_COSTS.modify : 0 },
    credits: profile.credits,
    canPublish: profile.is_admin || Boolean(plan.data?.can_publish),
    planName: plan.data?.name ?? profile.plan,
    url: `${SITE_URL}/apps/${p.slug}`,
    versions: (versions.data ?? []).map((v) => ({ ...v, author: who[v.author_id] ?? "—" })),
    members: (members.data ?? []).map((m) => ({ userId: m.user_id, role: m.role, name: who[m.user_id] ?? "—", since: m.created_at })),
    invitations: invitations.data ?? [],
    integrations: (integrations.data ?? []).map((i) => ({ id: i.id, label: i.label, status: i.status, lastError: i.last_error, lastTestedAt: i.last_tested_at, host: (() => { try { return new URL(i.config.url).host; } catch { return ""; } })() })),
    backups: backups.data ?? [],
    history: (history.data ?? []).map((h) => ({ ...h, actor: who[h.actor_id] ?? "—" })),
    logs: (logs.data ?? []).map((l) => ({ action: l.action, level: l.level, created_at: l.created_at, actor: who[l.actor_id] ?? "Système" })),
  };
  return (
    <AppShell wide>
      <Workspace data={data} initialTab={onglet} />
    </AppShell>
  );
}
