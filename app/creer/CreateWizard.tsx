"use client";

import { ArrowLeft, Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { VoiceButton } from "@/components/VoiceButton";
import { useToast } from "@/components/Toaster";
import { api, ApiError } from "@/lib/fetcher";
import { detectColumns, type ColumnInfo } from "@/lib/csv";
import { readImage, readTabular } from "@/lib/file-read";
import { MODULES } from "@/lib/modules";
import type { Diagnosis, Feature } from "@/lib/generator";

type Step = "describe" | "questions" | "plan" | "generating";
type Attachment = { kind: "table"; name: string; columns: ColumnInfo[]; rows: number } | { kind: "image"; name: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string; preview: string };

export function CreateWizard({ initialProblem, ai, credits, costs }: { initialProblem: string; ai: boolean; credits: number; costs: { diagnose: number } }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>("describe");
  const [problem, setProblem] = useState(initialProblem);
  const [businessName, setBusinessName] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [engine, setEngine] = useState<"ai" | "rules">(ai ? "ai" : "rules");
  const [balance, setBalance] = useState(credits);
  const [answeredBase, setAnsweredBase] = useState(0);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      if (file.type.startsWith("image/")) {
        const img = await readImage(file);
        setAttachment({ kind: "image", name: file.name, ...img });
      } else {
        const t = await readTabular(file);
        setAttachment({ kind: "table", name: file.name, columns: detectColumns(t.header, t.rows), rows: t.rows.length });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fichier illisible.");
    }
  }

  async function diagnose(withAnswers = answers) {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ diagnosis: Diagnosis; engine: "ai" | "rules"; creditsUsed: number }>("/api/diagnose", {
        body: {
          problem,
          businessName: businessName || undefined,
          answers: withAnswers.length ? withAnswers : undefined,
          csvColumns: attachment?.kind === "table" ? attachment.columns.map((c) => ({ name: c.name, type: c.type })) : undefined,
          image: attachment?.kind === "image" ? { mediaType: attachment.mediaType, data: attachment.data } : undefined,
        },
      });
      setEngine(res.engine);
      setBalance((b) => b - res.creditsUsed);
      setDiagnosis(res.diagnosis);
      if (res.diagnosis.businessName && !businessName) setBusinessName(res.diagnosis.businessName);
      const pending = res.diagnosis.questions.filter((q) => !withAnswers.some((a) => a.question === q));
      if (pending.length && withAnswers.length < 6) {
        setDiagnosis({ ...res.diagnosis, questions: pending });
        setQIndex(0);
        setAnsweredBase(withAnswers.length);
        setStep("questions");
      } else setStep("plan");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.push(`/connexion?next=${encodeURIComponent(`/creer?probleme=${encodeURIComponent(problem)}`)}`);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function answer(skip = false) {
    if (!diagnosis) return;
    const q = diagnosis.questions[qIndex]!;
    const next = skip || !currentAnswer.trim() ? answers : [...answers, { question: q, answer: currentAnswer.trim() }];
    setAnswers(next);
    setCurrentAnswer("");
    if (qIndex + 1 < diagnosis.questions.length) setQIndex(qIndex + 1);
    else if (next.length > answeredBase) void diagnose(next);
    else setStep("plan");
  }

  function toggleFeature(id: string) {
    if (!diagnosis) return;
    setDiagnosis({ ...diagnosis, features: diagnosis.features.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)) });
  }

  const available = useMemo(() => MODULES.filter((m) => !diagnosis?.features.some((f) => f.id === m.id || f.entity?.key === m.entity.key)), [diagnosis]);

  function addModule(id: string) {
    const m = MODULES.find((x) => x.id === id);
    if (!m || !diagnosis) return;
    const f: Feature = { id: m.id, title: m.title, description: m.description, selected: true };
    setDiagnosis({ ...diagnosis, features: [...diagnosis.features, f] });
  }

  async function generate() {
    if (!diagnosis) return;
    setStep("generating");
    setError("");
    try {
      const res = await api<{ id: string }>("/api/projects", { body: { diagnosis: { ...diagnosis, businessName: businessName.slice(0, 80), questions: [] }, problem } });
      toast("success", "Logiciel généré et testé.");
      router.push(`/projets/${res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setStep("plan");
    }
  }

  const selectedCount = diagnosis?.features.filter((f) => f.selected).length ?? 0;

  return (
    <div>
      <ol className="mb-8 flex items-center gap-2 text-xs text-slate-600" aria-label="Étapes">
        {[
          ["describe", "1. Votre besoin"],
          ["questions", "2. Précisions"],
          ["plan", "3. Plan du logiciel"],
          ["generating", "4. Génération"],
        ].map(([k, l], i) => (
          <li key={k} className={`flex items-center gap-2 ${step === k ? "text-slate-900" : ""}`}>
            {i > 0 && <span className="h-px w-4 bg-slate-200 sm:w-8" />}
            <span className={`rounded-full px-2.5 py-1 ${step === k ? "bg-blue-100 text-blue-700" : "bg-slate-50"}`}>{l}</span>
          </li>
        ))}
      </ol>

      {!ai && (
        <p className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-800">
          Aucun fournisseur IA n&apos;est configuré sur cette plateforme : l&apos;analyse est faite par règles (mots-clés et modèles validés). Elle est gratuite mais moins précise.
        </p>
      )}

      {error && (
        <p role="alert" className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {step === "describe" && (
        <section className="glass rounded-2xl p-5 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">Décrivez votre problème</h1>
          <p className="mt-2 text-sm text-slate-600">Expliquez simplement, comme à un collègue. L&apos;IA posera des questions si nécessaire.</p>
          <label htmlFor="pb" className="label mt-6">Votre problème</label>
          <textarea id="pb" rows={6} className="input" value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={4000} placeholder="Ex. : Je veux gérer les commandes, les stocks et les dépenses de mon restaurant." />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <VoiceButton onText={(t) => setProblem((p) => (p ? `${p} ${t}` : t))} />
            <span className="text-xs text-slate-500">La transcription s&apos;ajoute au texte : relisez-la avant de continuer.</span>
          </div>
          <label htmlFor="bn" className="label mt-6">Nom de votre entreprise (facultatif)</label>
          <input id="bn" className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={80} />

          <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-4">
            <label htmlFor="file" className="label">Joindre un fichier (facultatif)</label>
            <p className="mb-3 text-xs text-slate-500">Fichier Excel (.xlsx) ou CSV de suivi, ou photo d&apos;un cahier, d&apos;un formulaire, d&apos;une facture ou d&apos;un ancien logiciel. 2 Mo max (3,5 Mo pour une image). Le fichier n&apos;est pas exécuté ; ses données ne sont pas importées à cette étape.</p>
            <input id="file" type="file" accept=".csv,.xlsx,image/jpeg,image/png,image/webp" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-900" />
            {attachment?.kind === "table" && (
              <div className="mt-4 overflow-x-auto">
                <p className="mb-2 text-xs text-slate-600">
                  {attachment.name} — {attachment.rows} ligne(s), {attachment.columns.length} colonne(s) détectée(s) :
                </p>
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-600">
                    <tr><th className="py-1 pr-3">Colonne</th><th className="pr-3">Type détecté</th><th className="pr-3">Exemples</th><th>Anomalies</th></tr>
                  </thead>
                  <tbody>
                    {attachment.columns.map((c) => (
                      <tr key={c.name} className="border-t border-slate-100">
                        <td className="py-1 pr-3 text-slate-900">{c.name}</td>
                        <td className="pr-3">{c.type}</td>
                        <td className="max-w-40 truncate pr-3 text-slate-600">{c.samples.join(" · ")}</td>
                        <td className={c.issues ? "text-amber-800" : "text-slate-500"}>{c.issues ? `${c.issues} valeur(s) incohérente(s)` : c.empty ? `${c.empty} vide(s)` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {attachment?.kind === "image" && (
              <div className="mt-4 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.preview} alt="Aperçu de l'image jointe" className="h-20 w-20 rounded-lg object-cover" />
                <p className="text-xs text-slate-600">{ai ? "L'IA analysera cette image pour proposer la structure du logiciel." : "Analyse d'image indisponible sans fournisseur IA."}</p>
              </div>
            )}
            {attachment && (
              <button type="button" className="mt-3 text-xs text-slate-600 underline" onClick={() => setAttachment(null)}>
                Retirer le fichier
              </button>
            )}
          </div>

          <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-xs text-slate-600">
              {costs.diagnose > 0 ? `Coût estimé : ${costs.diagnose} crédits (remboursés en cas d'échec). Solde : ${balance} crédits.` : "Analyse par règles : gratuite."}
            </p>
            <button className="btn btn-primary" disabled={loading || problem.trim().length < 5 || (costs.diagnose > 0 && balance < costs.diagnose)} onClick={() => diagnose([])}>
              {loading && <span className="spinner" />} Analyser mon besoin
            </button>
          </div>
        </section>
      )}

      {step === "questions" && diagnosis && (
        <section className="glass rounded-2xl p-5 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-slate-900">Quelques précisions</h1>
          <p className="mt-2 text-sm text-slate-600">Répondez librement, ou passez la question.</p>
          <div className="mt-6 space-y-3">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-3 text-sm text-slate-800">{problem}</div>
            {answers.map((a) => (
              <div key={a.question} className="space-y-2">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-50 px-4 py-3 text-sm text-blue-700"><Bot className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden />{a.question}</div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-3 text-sm text-slate-800">{a.answer}</div>
              </div>
            ))}
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-50 px-4 py-3 text-sm text-blue-700"><Bot className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden />{diagnosis.questions[qIndex]}</div>
          </div>
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              answer();
            }}
          >
            <label htmlFor="ans" className="sr-only">Votre réponse</label>
            <input id="ans" className="input" value={currentAnswer} onChange={(e) => setCurrentAnswer(e.target.value)} maxLength={1000} autoFocus placeholder="Votre réponse…" />
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={loading}>{loading && <span className="spinner" />}Répondre</button>
              <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => answer(true)}>Passer</button>
            </div>
          </form>
          <VoiceButton onText={(t) => setCurrentAnswer((a) => (a ? `${a} ${t}` : t))} />
        </section>
      )}

      {step === "plan" && diagnosis && (
        <section className="space-y-6">
          <div className="glass rounded-2xl p-5 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="font-display text-2xl font-bold text-slate-900">Diagnostic</h1>
              <span className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-700">{engine === "ai" ? "Analyse IA" : "Analyse par règles"} · {diagnosis.sectorLabel}</span>
            </div>
            <dl className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Problème principal</dt>
                <dd className="mt-1 text-sm text-slate-800">{diagnosis.mainProblem}</dd>
              </div>
              <DList title="Tâches manuelles à améliorer" items={diagnosis.manualTasks} />
              <DList title="Données à conserver" items={diagnosis.dataToKeep} />
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Utilisateurs</dt>
                <dd className="mt-1 text-sm text-slate-800">{diagnosis.users}</dd>
              </div>
              <DList title="Automatisations possibles" items={diagnosis.automations} />
              {diagnosis.limits.length > 0 && <DList title="Limites techniques" items={diagnosis.limits} warn />}
            </dl>
          </div>

          <div className="glass rounded-2xl p-5 sm:p-8">
            <h2 className="font-display text-xl font-bold text-slate-900">Plan du logiciel</h2>
            <p className="mt-1 text-sm text-slate-600">Cochez les fonctionnalités à inclure. Vous pourrez en ajouter ou en retirer plus tard.</p>
            <label htmlFor="nm" className="label mt-5">Nom du logiciel</label>
            <input id="nm" className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={80} placeholder={`Gestion ${diagnosis.sectorLabel.toLowerCase()}`} />
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {diagnosis.features.map((f) => {
                const fields = f.entity?.fields ?? MODULES.find((m) => m.id === f.id)?.entity.fields ?? [];
                return (
                  <li key={f.id}>
                    <label className={`flex h-full cursor-pointer gap-3 rounded-xl border p-4 transition ${f.selected ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}>
                      <input type="checkbox" className="mt-1 h-5 w-5 accent-blue-600" checked={f.selected} onChange={() => toggleFeature(f.id)} />
                      <span>
                        <span className="block font-medium text-slate-900">{f.title}</span>
                        <span className="block text-xs text-slate-600">{f.description}</span>
                        <span className="mt-2 block text-[11px] text-slate-500">Champs : {fields.map((x) => x.label).join(", ")}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {available.length > 0 && (
              <div className="mt-5">
                <label htmlFor="add" className="label">Ajouter une fonctionnalité</label>
                <select id="add" className="input" value="" onChange={(e) => addModule(e.target.value)}>
                  <option value="">Choisir…</option>
                  {available.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button className="btn btn-ghost" onClick={() => setStep("describe")}><ArrowLeft className="h-4 w-4" aria-hidden />Modifier ma description</button>
              <button className="btn btn-primary" disabled={selectedCount === 0} onClick={generate}>
                Générer mon logiciel ({selectedCount} fonctionnalité{selectedCount > 1 ? "s" : ""})
              </button>
            </div>
          </div>
        </section>
      )}

      {step === "generating" && (
        <section className="glass rounded-2xl p-8 text-center" aria-busy="true">
          <div className="mx-auto mb-6 h-12 w-12 rounded-full border-4 border-slate-200 border-t-blue-600" style={{ animation: "spin 1s linear infinite" }} />
          <h1 className="font-display text-2xl font-bold text-slate-900">Génération en cours…</h1>
          <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm text-slate-700">
            <li>• Cahier des charges et modèle de données</li>
            <li>• Pages, formulaires et tableau de bord</li>
            <li>• Rôles et permissions</li>
            <li>• Tests automatiques et corrections</li>
          </ul>
        </section>
      )}
    </div>
  );
}

function DList({ title, items, warn }: { title: string; items: string[]; warn?: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{title}</dt>
      <dd>
        <ul className={`mt-1 list-disc space-y-1 pl-5 text-sm ${warn ? "text-amber-800" : "text-slate-800"}`}>
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </dd>
    </div>
  );
}
