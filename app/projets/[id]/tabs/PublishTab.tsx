"use client";

import { ExternalLink, Send, Users } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/status";
import { Panel, type TabId, type WorkspaceData } from "../Workspace";

export function PublishTab({ data, onChanged, goTo }: { data: WorkspaceData; onChanged: () => void; goTo: (t: TabId) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verify, setVerify] = useState<string>("");
  const { project } = data;
  const isPublished = project.status === "published";
  const isSuspended = project.status === "suspended";
  const hasPublished = Boolean(project.publishedVersion);
  const outdated = hasPublished && project.publishedVersion !== project.draftVersion;
  const lastTests = data.versions[0]?.test_report?.summary;

  async function act(action: "publish" | "suspend" | "resume") {
    setBusy(true);
    setError("");
    try {
      await api(`/api/projects/${project.id}/publish`, { body: { action } });
      toast("success", action === "publish" ? "Logiciel publié." : action === "suspend" ? "Publication suspendue." : "Publication réactivée.");
      if (action !== "suspend") await check();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setVerify("Vérification…");
    try {
      const r = await api<{ status: string; version: number }>(`/api/public/apps/${project.slug}`);
      setVerify(r.status === "online" ? `En ligne — version v${r.version} servie à l'adresse.` : "Publication suspendue.");
    } catch {
      setVerify("Le lien ne répond pas encore. Réessayez dans un instant.");
    }
  }

  return (
    <div className="space-y-6">
      <Panel title="Publication et lien permanent" subtitle="Votre logiciel est servi sur une adresse unique et permanente, accessible depuis Chrome sur téléphone, tablette et ordinateur, par les membres invités.">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Adresse du logiciel</p>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 truncate text-sm text-slate-900">{data.url}</code>
            <div className="flex gap-2">
              <CopyButton text={data.url} />
              {hasPublished && <a href={`/apps/${project.slug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg bg-blue-100 px-2.5 py-1.5 text-xs font-medium text-slate-900 hover:bg-blue-200">Ouvrir mon logiciel<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>}
            </div>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-3"><dt className="text-xs text-slate-500">État</dt><dd className="mt-1 flex items-center gap-2 text-slate-900"><span className={`h-2 w-2 rounded-full ${isPublished ? "bg-green-600" : isSuspended ? "bg-amber-500" : "bg-slate-400"}`} aria-hidden />{isPublished ? "Publié" : isSuspended ? "Suspendu" : "Non publié"}</dd></div>
          <div className="rounded-xl border border-slate-200 p-3"><dt className="text-xs text-slate-500">Version en ligne</dt><dd className="mt-1 text-slate-900">{hasPublished ? `v${project.publishedVersion} (${fmtDateTime(project.publishedAt)})` : "—"}</dd></div>
          <div className="rounded-xl border border-slate-200 p-3"><dt className="text-xs text-slate-500">Brouillon</dt><dd className="mt-1 text-slate-900">v{project.draftVersion}{lastTests ? ` · tests ${lastTests.passed}/${lastTests.total}` : ""}</dd></div>
        </dl>

        {outdated && <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">Le brouillon (v{project.draftVersion}) contient des modifications non publiées.</p>}
        {!data.canPublish && <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-800">La publication n&apos;est pas incluse dans la formule {data.planName}. Vous pouvez continuer à tester l&apos;aperçu ; passez à la formule Pro pour publier.</p>}
        {lastTests && lastTests.failed > 0 && (
          <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">
            {lastTests.failed} test(s) en échec bloquent la publication. <button className="underline" onClick={() => goTo("tests")}>Voir les tests</button>
          </p>
        )}
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {(!hasPublished || outdated || isPublished) && (
            <button className="btn btn-primary" disabled={busy || !data.canPublish || (isPublished && !outdated)} onClick={() => act("publish")}>
              {busy && <span className="spinner" />}
              {!busy && (!hasPublished || outdated) && <Send className="h-4 w-4" aria-hidden />}
              {!hasPublished ? "Publier" : outdated ? "Republier les modifications" : "✓ À jour"}
            </button>
          )}
          {isPublished && <button className="btn btn-danger" disabled={busy} onClick={() => confirm("Suspendre la publication ? Les membres ne pourront plus accéder au logiciel ; les données sont conservées.") && act("suspend")}>Suspendre la publication</button>}
          {isSuspended && <button className="btn btn-primary" disabled={busy} onClick={() => act("resume")}>Réactiver la publication</button>}
          {hasPublished && <button className="btn btn-ghost" onClick={check}>Vérifier l&apos;état</button>}
        </div>
        {verify && <p className="mt-3 text-sm text-slate-700" role="status">{verify}</p>}
      </Panel>
      <Panel title="Partager avec votre équipe" subtitle="Le lien seul ne suffit pas : chaque personne doit être invitée avec un rôle, puis se connecter.">
        <button className="btn btn-ghost" onClick={() => goTo("equipe")}><Users className="h-4 w-4" aria-hidden />Inviter des collaborateurs</button>
      </Panel>
    </div>
  );
}
