"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppRuntime } from "@/components/runtime/AppRuntime";
import { VoiceButton } from "@/components/VoiceButton";
import { composeSpec, diagnoseWithRules, type Diagnosis } from "@/lib/generator";
import { modifyWithRules } from "@/lib/modify-rules";
import { runChecks, summarize } from "@/lib/checks";
import { diffSpecs } from "@/lib/diff";
import { parseSpec, type AppSpec } from "@/lib/spec";
import { STATIC_SITE } from "@/lib/site-mode";

const STORE = "msdemo:spec";
const DATA = "msdemo:demo";
const EXAMPLES = [
  "Je veux gérer les commandes, les stocks et les dépenses de mon restaurant.",
  "Je veux un logiciel pour suivre les réparations de mon garage.",
  "Je veux gérer les élèves et les paiements de mon école.",
  "Je veux créer un système de réservation pour mon hôtel.",
];
const MODIFS = ["Ajoute une page pour gérer les employés.", "Ajoute un champ numéro de téléphone aux clients.", "Change les couleurs en vert et blanc.", "Ajoute des statistiques mensuelles."];

type Msg = { role: "user" | "assistant"; text: string };

/**
 * Démo publique : diagnostic par règles, génération et modifications exécutés dans le navigateur
 * avec exactement les mêmes composants que les logiciels publiés. Rien n'est envoyé au serveur.
 */
export function DemoStudio() {
  const initialProblem = (useSearchParams().get("probleme") ?? "").slice(0, 2000);
  const [step, setStep] = useState<"describe" | "plan" | "app">("describe");
  const [problem, setProblem] = useState(initialProblem);
  const [name, setName] = useState("");
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [spec, setSpec] = useState<AppSpec | null>(null);
  const [instruction, setInstruction] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [runtimeKey, setRuntimeKey] = useState(0);

  // Reprend la démo précédente du visiteur, si elle existe.
  useEffect(() => {
    if (initialProblem) return;
    try {
      const saved = localStorage.getItem(STORE);
      const parsed = saved ? parseSpec(JSON.parse(saved)) : null;
      if (parsed?.ok) {
        setSpec(parsed.spec);
        setStep("app");
      }
    } catch {
      /* rien à reprendre */
    }
  }, [initialProblem]);

  useEffect(() => {
    if (!spec) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(spec));
    } catch {
      /* stockage indisponible */
    }
  }, [spec]);

  const checks = useMemo(() => (spec ? summarize(runChecks(spec)) : null), [spec]);

  function analyse() {
    const d = diagnoseWithRules({ problem, businessName: name || undefined, answers: name ? [{ question: "Quel est le nom de votre entreprise ?", answer: name }] : undefined });
    setDiagnosis(d);
    if (d.businessName && !name) setName(d.businessName);
    setStep("plan");
  }

  function generate() {
    if (!diagnosis) return;
    try {
      localStorage.removeItem(DATA);
    } catch {
      /* ignore */
    }
    setSpec(composeSpec({ ...diagnosis, businessName: name }));
    setMsgs([]);
    setRuntimeKey((k) => k + 1);
    setStep("app");
  }

  function modify(text: string) {
    if (!spec || text.trim().length < 3) return;
    const r = modifyWithRules(spec, text);
    setMsgs((m) => [...m, { role: "user", text }]);
    if (!r.ok) {
      setMsgs((m) => [...m, { role: "assistant", text: r.message }]);
    } else {
      const changes = diffSpecs(spec, r.spec);
      setMsgs((m) => [...m, { role: "assistant", text: `${r.summary}${changes.length ? ` (${changes.length} changement${changes.length > 1 ? "s" : ""}, données conservées)` : ""}` }]);
      setSpec(r.spec);
    }
    setInstruction("");
  }

  function resetData() {
    try {
      localStorage.removeItem(DATA);
    } catch {
      /* ignore */
    }
    setRuntimeKey((k) => k + 1);
  }

  function restart() {
    try {
      localStorage.removeItem(STORE);
      localStorage.removeItem(DATA);
    } catch {
      /* ignore */
    }
    setSpec(null);
    setDiagnosis(null);
    setMsgs([]);
    setStep("describe");
  }

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/5 px-4 py-3 text-sm text-sky-100 sm:flex-row sm:items-center">
        <p>
          <strong>Démo sans compte.</strong> Analyse par règles, logiciel et données conservés uniquement dans ce navigateur.{STATIC_SITE ? " La version complète (analyse IA, sauvegarde, équipe, publication) arrive bientôt." : " Créez un compte pour l'analyse IA, la sauvegarde, l'équipe et la publication."}
        </p>
        {!STATIC_SITE && <Link href={`/inscription?next=${encodeURIComponent(`/creer?probleme=${encodeURIComponent(problem)}`)}`} className="btn btn-primary shrink-0">Créer mon compte</Link>}
      </div>

      {step === "describe" && (
        <section className="glass mx-auto max-w-3xl rounded-2xl p-5 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Essayez maintenant, sans compte</h1>
          <p className="mt-2 text-sm text-slate-400">Décrivez votre problème : un mini-logiciel fonctionnel apparaît en quelques secondes.</p>
          <label htmlFor="d-pb" className="label mt-6">Votre problème</label>
          <textarea id="d-pb" rows={4} className="input" value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={2000} placeholder="Décrivez le problème que vous souhaitez résoudre…" />
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setProblem(ex)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:border-brand-400 hover:text-white">{ex.replace("Je veux ", "")}</button>
            ))}
          </div>
          <div className="mt-3"><VoiceButton onText={(t) => setProblem((p) => (p ? `${p} ${t}` : t))} /></div>
          <label htmlFor="d-name" className="label mt-6">Nom de votre entreprise (facultatif)</label>
          <input id="d-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <button className="btn btn-primary mt-6 w-full sm:w-auto" disabled={problem.trim().length < 5} onClick={analyse}>Analyser mon besoin</button>
        </section>
      )}

      {step === "plan" && diagnosis && (
        <section className="glass mx-auto max-w-3xl rounded-2xl p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-display text-2xl font-bold text-white">Plan du logiciel</h1>
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">📐 Analyse par règles · {diagnosis.sectorLabel}</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">{diagnosis.mainProblem}</p>
          <label htmlFor="d-name2" className="label mt-5">Nom du logiciel</label>
          <input id="d-name2" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={`Gestion ${diagnosis.sectorLabel.toLowerCase()}`} />
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {diagnosis.features.map((f) => (
              <li key={f.id}>
                <label className={`flex h-full cursor-pointer gap-3 rounded-xl border p-4 ${f.selected ? "border-brand-400/60 bg-brand-500/10" : "border-white/10"}`}>
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-[#6d5dfc]" checked={f.selected} onChange={() => setDiagnosis({ ...diagnosis, features: diagnosis.features.map((x) => (x.id === f.id ? { ...x, selected: !x.selected } : x)) })} />
                  <span><span className="block font-medium text-white">{f.title}</span><span className="block text-xs text-slate-400">{f.description}</span></span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button className="btn btn-ghost" onClick={() => setStep("describe")}>← Modifier ma description</button>
            <button className="btn btn-primary" disabled={!diagnosis.features.some((f) => f.selected)} onClick={generate}>Générer mon logiciel</button>
          </div>
        </section>
      )}

      {step === "app" && spec && (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
            <AppRuntime key={runtimeKey} projectId="demo" spec={spec} mode="local" role="owner" compact />
          </div>
          <aside className="space-y-4">
            <section className="glass rounded-2xl p-5">
              <h2 className="font-display text-lg font-semibold text-white">✨ Modifier le logiciel</h2>
              <p className="mt-1 text-xs text-slate-400">En démo, les demandes courantes sont reconnues par règles. Avec un compte, l&apos;IA comprend des demandes libres.</p>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto" aria-live="polite">
                {msgs.length === 0 && (
                  <div className="flex flex-wrap gap-2">
                    {MODIFS.map((m) => <button key={m} onClick={() => modify(m)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-left text-xs text-slate-300 hover:border-brand-400">{m}</button>)}
                  </div>
                )}
                {msgs.map((m, i) => (
                  <p key={i} className={m.role === "user" ? "ml-6 rounded-xl bg-brand-500/20 px-3 py-2 text-sm text-white" : "mr-4 rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-200"}>{m.text}</p>
                ))}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); modify(instruction); }}>
                <label htmlFor="d-mod" className="sr-only">Votre demande</label>
                <input id="d-mod" className="input" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ex. : Ajoute un export PDF" maxLength={500} />
                <button className="btn btn-primary shrink-0">OK</button>
              </form>
            </section>
            {checks && (
              <section className="glass rounded-2xl p-5">
                <h2 className="font-display text-lg font-semibold text-white">🧪 Tests automatiques</h2>
                <p className="mt-1 text-sm text-slate-300">{checks.passed}/{checks.total} réussis{checks.warnings ? ` · ${checks.warnings} avertissement(s)` : ""}{checks.failed ? ` · ${checks.failed} échec(s)` : ""}</p>
                <p className="mt-1 text-xs text-slate-500">Structure, formulaires, calculs, permissions et affichage mobile. Les tests en base de données et l&apos;isolation entre clients s&apos;exécutent sur votre compte.</p>
              </section>
            )}
            <section className="glass rounded-2xl p-5">
              <h2 className="font-display text-lg font-semibold text-white">🚀 Passer à la vraie version</h2>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                <li>• Analyse IA de votre besoin, photos et fichiers Excel</li>
                <li>• Données sauvegardées, versions et restauration</li>
                <li>• Lien permanent à partager avec votre équipe</li>
              </ul>
              {STATIC_SITE ? (
                <p className="mt-4 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300">Les comptes, la sauvegarde en ligne et la publication arrivent bientôt sur la version complète de la plateforme.</p>
              ) : (
                <Link href={`/inscription?next=${encodeURIComponent(`/creer?probleme=${encodeURIComponent(problem)}`)}`} className="btn btn-primary mt-4 w-full">Créer mon compte gratuit</Link>
              )}
              <div className="mt-3 flex gap-2">
                <button className="btn btn-ghost flex-1" onClick={resetData}>Données d&apos;exemple</button>
                <button className="btn btn-ghost flex-1" onClick={restart}>Recommencer</button>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
