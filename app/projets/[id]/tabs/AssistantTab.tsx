"use client";

import { useState } from "react";
import { AppRuntime } from "@/components/runtime/AppRuntime";
import { VoiceButton } from "@/components/VoiceButton";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import type { AppSpec } from "@/lib/spec";
import type { CheckResult } from "@/lib/checks";
import type { Change } from "@/lib/diff";
import { Panel, type WorkspaceData } from "../Workspace";
import { ChecksList } from "./ChecksList";

type Proposal = { engine: "ai" | "rules"; creditsUsed: number; summary: string; changes: Change[]; checks: CheckResult[]; proposal: AppSpec | null; baseVersion: number };
type Msg = { role: "user" | "assistant"; text: string; proposal?: Proposal; status?: "applied" | "cancelled" };

const EXAMPLES = ["Ajoute une page pour gérer les employés.", "Ajoute un champ numéro de téléphone aux clients.", "Change les couleurs en vert et blanc.", "Ajoute des statistiques mensuelles.", "Permets à mon employé de consulter les commandes sans modifier les prix.", "Ajoute un export PDF."];

export function AssistantTab({ data, spec, onApplied }: { data: WorkspaceData; spec: AppSpec; onApplied: () => void }) {
  const toast = useToast();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [compare, setCompare] = useState<"before" | "after">("after");
  const active = [...msgs].reverse().find((m) => m.proposal?.proposal && !m.status);

  async function send(text: string) {
    if (text.trim().length < 3) return;
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    try {
      const r = await api<Proposal>(`/api/projects/${data.project.id}/modify`, { body: { instruction: text } });
      setMsgs((m) => [...m, { role: "assistant", text: r.summary, proposal: r }]);
      setCompare("after");
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `⚠️ ${e instanceof Error ? e.message : "Erreur"}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function apply(msg: Msg) {
    const p = msg.proposal!;
    if (p.checks.some((c) => c.status === "fail")) return toast("error", "Cette proposition ne passe pas les tests : elle ne peut pas être appliquée.");
    setBusy(true);
    try {
      const r = await api<{ version: number }>(`/api/projects/${data.project.id}/versions`, { body: { spec: p.proposal, summary: msg.text.slice(0, 1000), source: p.engine, baseVersion: p.baseVersion } });
      setMsgs((m) => m.map((x) => (x === msg ? { ...x, status: "applied" } : x)));
      toast("success", `Version v${r.version} créée. ${data.project.publishedVersion ? "Republiez pour la mettre en ligne." : ""}`);
      onApplied();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
      <Panel title="Assistant de modification" subtitle={data.ai ? `IA activée · ${data.costs.modify} crédits par demande (remboursés en cas d'échec) · solde ${data.credits}` : "Mode sans IA : demandes courantes reconnues par règles (gratuit)."}>
        <div className="max-h-[480px] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {msgs.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-400">Décrivez la modification souhaitée. L&apos;assistant ne modifie que les éléments nécessaires, conserve vos données et teste la proposition avant de vous la montrer.</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((e) => (
                  <button key={e} onClick={() => setInput(e)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-left text-xs text-slate-300 hover:border-brand-400">{e}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-8 rounded-2xl rounded-tr-sm bg-brand-500/20 px-4 py-3 text-sm text-white" : "mr-4 rounded-2xl rounded-tl-sm bg-white/5 px-4 py-3 text-sm text-slate-200"}>
              <p>{m.text}</p>
              {m.proposal && m.proposal.changes.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">Changements ({m.proposal.engine === "ai" ? "IA" : "règles"})</p>
                  <ul className="space-y-1 text-xs">
                    {m.proposal.changes.map((c, k) => (
                      <li key={k}>
                        <span className={c.kind === "added" ? "text-emerald-300" : c.kind === "removed" ? "text-red-300" : "text-amber-200"}>{c.kind === "added" ? "+ " : c.kind === "removed" ? "− " : "~ "}</span>
                        {c.target} — {c.detail}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-slate-400">
                    Tests : {m.proposal.checks.filter((c) => c.status === "pass").length}/{m.proposal.checks.length} réussis
                    {m.proposal.checks.some((c) => c.status === "fail") && " — échecs bloquants"}
                  </p>
                  {m.proposal.changes.some((c) => c.kind === "removed") && <p className="text-xs text-amber-200">⚠ Éléments retirés de l&apos;affichage : leurs données restent stockées et réapparaissent si vous restaurez une version précédente.</p>}
                  {data.project.publishedVersion && <p className="text-xs text-slate-400">Une sauvegarde de vos données réelles sera créée avant application.</p>}
                  {!m.status ? (
                    <div className="flex gap-2 pt-1">
                      <button className="btn btn-primary flex-1" disabled={busy} onClick={() => apply(m)}>Appliquer</button>
                      <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => setMsgs((all) => all.map((x) => (x === m ? { ...x, status: "cancelled" } : x)))}>Annuler</button>
                    </div>
                  ) : (
                    <p className="text-xs font-medium">{m.status === "applied" ? "✅ Appliqué" : "Annulé"}</p>
                  )}
                </div>
              )}
              {m.proposal && m.proposal.changes.length === 0 && <p className="mt-2 text-xs text-slate-400">Aucune modification n&apos;a été faite.</p>}
            </div>
          ))}
          {busy && <p className="text-sm text-slate-400"><span className="spinner mr-2 inline-block align-middle" />Préparation et test de la modification…</p>}
        </div>
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <label htmlFor="instr" className="sr-only">Votre demande</label>
          <textarea id="instr" rows={2} className="input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} placeholder="Ex. : Ajoute un champ « numéro de téléphone » aux clients" />
          <div className="flex items-center justify-between gap-2">
            <VoiceButton onText={(t) => setInput((v) => (v ? `${v} ${t}` : t))} />
            <button className="btn btn-primary" disabled={busy || input.trim().length < 3}>Envoyer</button>
          </div>
        </form>
      </Panel>

      <div className="space-y-4">
        {active?.proposal?.proposal ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-white">Prévisualisation</h2>
              <div role="group" aria-label="Comparer" className="flex rounded-xl border border-white/10 p-1 text-sm">
                <button className={`rounded-lg px-3 py-1.5 ${compare === "before" ? "bg-white/10 text-white" : "text-slate-400"}`} onClick={() => setCompare("before")} aria-pressed={compare === "before"}>Avant</button>
                <button className={`rounded-lg px-3 py-1.5 ${compare === "after" ? "bg-brand-500/30 text-white" : "text-slate-400"}`} onClick={() => setCompare("after")} aria-pressed={compare === "after"}>Après</button>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <AppRuntime key={compare} projectId={data.project.id} spec={compare === "after" ? active.proposal.proposal : spec} mode="demo" role={data.role} compact />
            </div>
            {active.proposal.checks.some((c) => c.status !== "pass") && <ChecksList checks={active.proposal.checks.filter((c) => c.status !== "pass")} />}
          </>
        ) : (
          <div className="glass grid min-h-64 place-items-center rounded-2xl p-8 text-center text-sm text-slate-400">La prévisualisation avant/après apparaîtra ici dès qu&apos;une modification sera proposée.</div>
        )}
      </div>
    </div>
  );
}
