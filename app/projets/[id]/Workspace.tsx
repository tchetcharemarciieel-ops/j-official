"use client";

import Link from "next/link";
import { SlidingPill, useSlidingIndicator } from "@/components/ui/SlidingIndicator";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Database, Eye, FlaskConical, History, MessageSquare, Plug, Send, Settings, Users, type LucideIcon } from "lucide-react";
import { STATUS } from "@/lib/status";
import type { AppSpec, Role } from "@/lib/spec";
import type { CheckResult } from "@/lib/checks";
import type { Change } from "@/lib/diff";
import type { Diagnosis } from "@/lib/generator";
import { PreviewTab } from "./tabs/PreviewTab";
import { AssistantTab } from "./tabs/AssistantTab";
import { TestsTab } from "./tabs/TestsTab";
import { VersionsTab } from "./tabs/VersionsTab";
import { PublishTab } from "./tabs/PublishTab";
import { TeamTab } from "./tabs/TeamTab";
import { DataTab } from "./tabs/DataTab";
import { IntegrationsTab } from "./tabs/IntegrationsTab";
import { SettingsTab } from "./tabs/SettingsTab";

export type VersionRow = {
  version: number;
  spec: AppSpec;
  summary: string;
  changes: Change[];
  test_report: { checks: CheckResult[]; summary: { total: number; passed: number; warnings: number; failed: number }; ranAt: string; full?: boolean } | null;
  author: string;
  source: string;
  published: boolean;
  created_at: string;
};

export type WorkspaceData = {
  project: { id: string; name: string; slug: string; status: string; sector: string; problem: string; draftVersion: number; publishedVersion: number | null; publishedAt: string | null; lastError: string | null; createdAt: string };
  spec: AppSpec | null;
  published: AppSpec | null;
  diagnosis: Diagnosis | null;
  role: Role;
  meId: string;
  ai: boolean;
  costs: { modify: number };
  credits: number;
  canPublish: boolean;
  planName: string;
  url: string;
  versions: VersionRow[];
  members: { userId: string; role: string; name: string; since: string }[];
  invitations: { id: string; email: string; role: string; expires_at: string; created_at: string }[];
  integrations: { id: string; label: string; status: string; lastError: string | null; lastTestedAt: string | null; host: string }[];
  backups: { id: string; label: string; record_count: number; created_at: string }[];
  history: { entity: string; action: string; actor: string; created_at: string }[];
  logs: { action: string; level: string; actor: string; created_at: string }[];
};

const TABS = [
  ["apercu", "Aperçu", Eye],
  ["assistant", "Modifier avec l'IA", MessageSquare],
  ["tests", "Tests", FlaskConical],
  ["versions", "Versions", History],
  ["publication", "Publication", Send],
  ["equipe", "Équipe", Users],
  ["donnees", "Données", Database],
  ["integrations", "Intégrations", Plug],
  ["parametres", "Paramètres", Settings],
] as const satisfies readonly (readonly [string, string, LucideIcon])[];
export type TabId = (typeof TABS)[number][0];

export function Workspace({ data, initialTab }: { data: WorkspaceData; initialTab?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(() => (TABS.some(([id]) => id === initialTab) ? (initialTab as TabId) : "apercu"));
  const refresh = () => router.refresh();
  const { ref: tabsRef, box: tabBox, animate: tabAnimate } = useSlidingIndicator<HTMLDivElement>(tab);
  const st = STATUS[data.project.status] ?? STATUS.preparation!;
  const latest = data.versions[0];

  if (!data.spec)
    return (
      <div className="glass rounded-2xl p-8">
        <h1 className="font-display text-2xl font-bold text-slate-900">{data.project.name}</h1>
        <p className="mt-2 text-red-700">La génération n&apos;a pas abouti : {data.project.lastError ?? "aucune version valide."}</p>
        <Link href="/creer" className="btn btn-primary mt-4">Relancer une création</Link>
      </div>
    );

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <Link href="/espace" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" aria-hidden />Mon espace</Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="truncate font-display text-2xl font-bold text-slate-900 sm:text-3xl">{data.spec.name}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs ${st.cls}`}>{st.label}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {data.project.sector} · brouillon v{data.project.draftVersion}
            {data.project.publishedVersion ? ` · en ligne : v${data.project.publishedVersion}` : " · non publié"}
            {latest?.test_report && ` · tests : ${latest.test_report.summary.passed}/${latest.test_report.summary.total} réussis`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => setTab("assistant")}><MessageSquare className="h-4 w-4" aria-hidden />Modifier avec l&apos;IA</button>
          <button className="btn btn-ghost" onClick={() => setTab("tests")}><FlaskConical className="h-4 w-4" aria-hidden />Tester le logiciel</button>
          <button className="btn btn-primary" onClick={() => setTab("publication")}><Send className="h-4 w-4" aria-hidden />Publier mon logiciel</button>
        </div>
      </div>

      {data.project.status === "failed" && data.project.lastError && (
        <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          Échec nécessitant une correction : {data.project.lastError}{" "}
          <button className="underline" onClick={() => setTab("tests")}>Voir les tests</button>
        </p>
      )}

      <div className="mt-6 overflow-x-auto">
        <div ref={tabsRef} role="tablist" aria-label="Sections du projet" className="relative flex min-w-max gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
          <SlidingPill box={tabBox} animate={tabAnimate} className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200" />
          {TABS.map(([id, label, Icon]) => (
            <button key={id} data-tab={id} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} id={`tab-${id}`} onClick={() => setTab(id)} className={`tab-press relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition-colors duration-300 ${tab === id ? "font-medium text-slate-900" : "text-slate-600 hover:text-slate-900"}`}>
              <Icon key={tab === id ? "on" : "off"} className={`h-4 w-4 ${tab === id ? "tab-pop text-blue-600" : "text-slate-500"}`} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-6">
        {tab === "apercu" && <PreviewTab data={data} spec={data.spec} goTo={setTab} />}
        {tab === "assistant" && <AssistantTab data={data} spec={data.spec} onApplied={refresh} />}
        {tab === "tests" && <TestsTab data={data} onChanged={refresh} />}
        {tab === "versions" && <VersionsTab data={data} onChanged={refresh} />}
        {tab === "publication" && <PublishTab data={data} onChanged={refresh} goTo={setTab} />}
        {tab === "equipe" && <TeamTab data={data} onChanged={refresh} />}
        {tab === "donnees" && <DataTab data={data} spec={data.spec} onChanged={refresh} />}
        {tab === "integrations" && <IntegrationsTab data={data} spec={data.spec} onChanged={refresh} />}
        {tab === "parametres" && <SettingsTab data={data} spec={data.spec} onChanged={refresh} />}
      </div>
    </div>
  );
}

export function Panel({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
