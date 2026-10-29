"use client";

import { ClipboardCheck, Compass, Megaphone, PencilRuler, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { AssistantChat } from "@/components/assistant/AssistantChat";

type AgentId = "general" | "diagnostic" | "conception" | "qualite" | "commercial";

const AGENTS: Record<AgentId, { label: string; icon: LucideIcon; role: string; intro: string; starters: string[] }> = {
  general: {
    label: "Général",
    icon: Sparkles,
    role: "Les 4 missions à la fois",
    intro: "Présentez une entreprise, un problème ou une tâche commerciale : l'assistant répond en 7 rubriques et prépare des brouillons que vous validez.",
    starters: ["Diagnostic rapide d'un salon de coiffure à Bangui, puis la solution prioritaire.", "Par quoi commencer pour trouver mes 3 premiers clients ?"],
  },
  diagnostic: {
    label: "Diagnostic",
    icon: Compass,
    role: "Comprendre une entreprise et ses problèmes",
    intro: "Décrivez l'entreprise (métier, taille, outils actuels). L'agent liste les problèmes probables, ceux qui coûtent le plus, les questions à poser au dirigeant et les solutions classées.",
    starters: ["Un restaurant de 20 places qui perd des commandes et ne sait pas ce qui est payé.", "Une pharmacie de quartier avec 2 employés et un cahier de ventes.", "Un garage de 4 mécaniciens qui suit les réparations sur WhatsApp."],
  },
  conception: {
    label: "Conception",
    icon: PencilRuler,
    role: "Concevoir le mini-logiciel",
    intro: "Donnez le problème à résoudre. L'agent propose rôles, fonctionnalités, pages et parcours, modèle de données, sécurité et plan technique (code sur demande).",
    starters: ["Conçois un mini-logiciel de stock et de péremption pour une pharmacie.", "Conçois la caisse d'un maquis : commandes, paiements mobile money, rapport du soir.", "Modèle de données pour un salon : rendez-vous, prestations, clients."],
  },
  qualite: {
    label: "Qualité",
    icon: ClipboardCheck,
    role: "Scénarios de test et risques",
    intro: "Décrivez le logiciel ou la fonctionnalité à vérifier. L'agent prépare les scénarios de test, les vérifications de permissions, les cas limites et les risques. Il n'exécute aucun test.",
    starters: ["Scénarios de test du module caisse d'un restaurant.", "Vérifications de permissions pour un logiciel avec gérant, employé et lecture seule.", "Cas limites des réservations de chambres d'hôtel."],
  },
  commercial: {
    label: "Commercial",
    icon: Megaphone,
    role: "Offre, prospection, démonstration, contenus",
    intro: "Indiquez la cible (métier, quartier) et votre objectif. L'agent prépare offre, messages, scripts et contenus — rien n'est envoyé ni publié sans vous.",
    starters: ["Message WhatsApp pour proposer une démonstration à un garage.", "Script de démonstration de 5 minutes sur téléphone pour un restaurant.", "10 idées de vidéos TikTok pour MiniSoft RCA, sans faux témoignages.", "Tableau simple de suivi des prospects avec relances."],
  },
};

/** Agents spécialisés du propriétaire : chacun a ses consignes et sa propre conversation. */
export function AgentsChat({ note }: { note: string }) {
  const [agent, setAgent] = useState<AgentId>("diagnostic");
  useEffect(() => {
    try {
      const a = localStorage.getItem("msagent:last") as AgentId | null;
      if (a && a in AGENTS) setAgent(a);
    } catch {
      /* stockage indisponible */
    }
  }, []);
  const pick = (a: AgentId) => {
    setAgent(a);
    try {
      localStorage.setItem("msagent:last", a);
    } catch {
      /* stockage indisponible */
    }
  };
  const A = AGENTS[agent];
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Agents" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(Object.keys(AGENTS) as AgentId[]).map((id) => {
          const x = AGENTS[id];
          const on = id === agent;
          return (
            <button key={id} type="button" role="tab" aria-selected={on} onClick={() => pick(id)} className={`tab-press flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${on ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <x.icon className={`h-5 w-5 ${on ? "text-blue-700" : "text-slate-500"}`} aria-hidden />
              <span className="text-sm font-semibold text-slate-900">Agent {x.label}</span>
              <span className="text-[11px] leading-tight text-slate-500">{x.role}</span>
            </button>
          );
        })}
      </div>
      <AssistantChat key={agent} endpoint="/api/admin/assistant" storageKey={`msassistant:admin:${agent}`} extra={{ agent }} title={`Agent ${A.label}`} intro={A.intro} starters={A.starters} note={note} />
    </div>
  );
}
