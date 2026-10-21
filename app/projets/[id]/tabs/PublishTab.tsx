"use client";

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
      setVerify(r.status === "online" ? `✅ En ligne — version v${r.version} servie à l'adresse.` : "⏸ Publication suspendue.");
    } catch {
      setVerify("❌ Le lien ne répond pas encore. Réessayez dans un instant.");
    }
  }

  return (
    <div className="space-y-6">
      <Panel title="Publication et lien permanent" subtitle="Votre logiciel est servi sur une adresse unique et permanente, accessible depuis Chrome sur téléphone, tablette et ordinateur, par les membres invités.">
        <div className="rounded-xl bg-night-950/60 p-4">
          <p className="text-xs text-slate-500">Adresse du logiciel</p>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 truncate text-sm text-white">{data.url}</code>
            <div className="flex gap-2">
              <CopyButton text={data.url} />
              {hasPublished && <a href={`/apps/${project.slug}`} target="_blank" rel="noopener" className="rounded-lg bg-brand-500/40 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-500/60">Ouvrir mon logiciel ↗</a>}
            </div>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 p-3"><dt className="text-xs text-slate-500">État</dt><dd className="mt-1 text-white">{isPublished ? "🟢 Publié" : isSuspended ? "⏸ Suspendu" : "Non publié"}</dd></div>
          <div className="rounded-xl border border-white/10 p-3"><dt className="text-xs text-slate-500">Version en ligne</dt><dd className="mt-1 text-white">{hasPublished ? `v${project.publishedVersion} (${fmtDateTime(project.publishedAt)})` : "—"}</dd></div>
          <div className="rounded-xl border border-white/10 p-3"><dt className="text-xs text-slate-500">Brouillon</dt><dd className="mt-1 text-white">v{project.draftVersion}{lastTests ? ` · tests ${lastTests.passed}/${lastTests.total}` : ""}</dd></div>
        </dl>

        {outdated && <p className="mt-4 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">Le brouillon (v{project.draftVersion}) contient des modifications non publiées.</p>}
        {!data.canPublish && <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">La publication n&apos;est pas incluse dans la formule {data.planName}. Vous pouvez continuer à tester l&apos;aperçu ; passez à la formule Pro pour publier.</p>}
        {lastTests && lastTests.failed > 0 && (
          <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {lastTests.failed} test(s) en échec bloquent la publication. <button className="underline" onClick={() => goTo("tests")}>Voir les tests</button>
          </p>
        )}
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {(!hasPublished || outdated || isPublished) && (
            <button className="btn btn-primary" disabled={busy || !data.canPublish || (isPublished && !outdated)} onClick={() => act("publish")}>
              {busy && <span className="spinner" />}
              {!hasPublished ? "🚀 Publier" : outdated ? "🔁 Republier les modifications" : "✓ À jour"}
            </button>
          )}
          {isPublished && <button className="btn btn-danger" disabled={busy} onClick={() => confirm("Suspendre la publication ? Les membres ne pourront plus accéder au logiciel ; les données sont conservées.") && act("suspend")}>⏸ Suspendre la publication</button>}
          {isSuspended && <button className="btn btn-primary" disabled={busy} onClick={() => act("resume")}>▶ Réactiver la publication</button>}
          {hasPublished && <button className="btn btn-ghost" onClick={check}>Vérifier l&apos;état</button>}
        </div>
        {verify && <p className="mt-3 text-sm text-slate-300" role="status">{verify}</p>}
      </Panel>
      <Panel title="Partager avec votre équipe" subtitle="Le lien seul ne suffit pas : chaque personne doit être invitée avec un rôle, puis se connecter.">
        <button className="btn btn-ghost" onClick={() => goTo("equipe")}>👥 Inviter des collaborateurs</button>
      </Panel>
    </div>
  );
}
