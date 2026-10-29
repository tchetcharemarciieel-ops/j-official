"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { onboardingSchema, sectorLabel, suggestions, type OnboardingAnswers } from "@/lib/onboarding";

const STORE = "msonboarding:v1";

/**
 * Accueil personnalisé selon le questionnaire d'inscription. Si les réponses n'ont pas pu être
 * enregistrées à l'inscription (réseau), elles sont reprises de ce navigateur et envoyées ici.
 */
export function Welcome({ answers: initial, firstName }: { answers: OnboardingAnswers | null; firstName: string }) {
  const [answers, setAnswers] = useState(initial);
  useEffect(() => {
    if (initial) return;
    try {
      const raw = localStorage.getItem(STORE);
      const parsed = raw ? onboardingSchema.safeParse((JSON.parse(raw) as { a: unknown }).a) : null;
      if (!parsed?.success) return;
      fetch("/api/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: parsed.data }) })
        .then((r) => {
          if (!r.ok) return;
          setAnswers(parsed.data);
          localStorage.removeItem(STORE);
        })
        .catch(() => undefined);
    } catch {
      /* stockage indisponible */
    }
  }, [initial]);
  if (!answers) return null;
  const list = suggestions(answers);
  return (
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 animate-fade-up" aria-labelledby="welcome-title">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700"><Sparkles className="h-4 w-4" aria-hidden />Pour {sectorLabel(answers).toLowerCase()}</p>
      <h2 id="welcome-title" className="mt-1 font-display text-xl font-bold text-slate-900">Bienvenue sur MiniSoft RCA{firstName ? `, ${firstName}` : ""} !</h2>
      <p className="mt-1 text-sm text-slate-600">Nous allons t&apos;aider à trouver une solution adaptée à ton entreprise. Voici des idées choisies d&apos;après tes réponses ; le logiciel est créé seulement quand tu le lances.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {list.map((s) => (
          <li key={s.title}>
            <Link href={s.href} className="lift group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300">
              <span className="font-semibold text-slate-900">{s.title}</span>
              <span className="mt-1 flex-1 text-sm text-slate-600">{s.text}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-700">Créer ce logiciel<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
