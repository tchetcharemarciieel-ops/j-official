"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ProjectCard } from "./ProjectCard";
import { normalize } from "@/lib/generator";
import type { EspaceProject } from "@/lib/espace";

const FILTERS = [
  { id: "tous", label: "Tous", match: () => true },
  { id: "en-cours", label: "En cours", match: (s: string) => ["preparation", "generation", "test"].includes(s) },
  { id: "published", label: "Publiés", match: (s: string) => s === "published" },
  { id: "suspended", label: "Suspendus", match: (s: string) => s === "suspended" },
  { id: "failed", label: "À corriger", match: (s: string) => s === "failed" },
] as const;

const SORTS = [
  { id: "maj", label: "Dernière modification" },
  { id: "recent", label: "Date de création (récent)" },
  { id: "ancien", label: "Date de création (ancien)" },
  { id: "nom", label: "Nom (A → Z)" },
] as const;

export function ProjectsBoard({ projects, initialFilter }: { projects: EspaceProject[]; initialFilter?: string }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>(FILTERS.some((f) => f.id === initialFilter) ? initialFilter! : "tous");
  const [sort, setSort] = useState<string>("maj");

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, projects.filter((p) => f.match(p.status)).length])), [projects]);
  const list = useMemo(() => {
    const needle = normalize(q.trim());
    const f = FILTERS.find((x) => x.id === filter)!;
    const out = projects.filter((p) => f.match(p.status) && (!needle || normalize(`${p.name} ${p.description} ${p.sector} ${p.slug}`).includes(needle)));
    return out.sort((a, b) =>
      sort === "nom" ? a.name.localeCompare(b.name, "fr") : sort === "recent" ? b.createdAt.localeCompare(a.createdAt) : sort === "ancien" ? a.createdAt.localeCompare(b.createdAt) : b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [projects, q, filter, sort]);

  return (
    <div>
      <div className="glass sticky top-[72px] z-20 flex flex-col gap-3 rounded-2xl p-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Rechercher un logiciel</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par nom, description, secteur…" className="input" style={{ paddingLeft: "2.4rem" }} />
        </label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0" role="tablist" aria-label="Filtrer par statut">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`shrink-0 rounded-xl px-3 py-2 text-sm transition ${filter === f.id ? "bg-blue-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
              {f.label} <span className="text-xs opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <label className="shrink-0">
          <span className="sr-only">Trier</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="input !min-h-0 py-2 text-sm">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <p className="mt-4 text-sm text-slate-500" aria-live="polite">{list.length} logiciel{list.length > 1 ? "s" : ""}</p>
      {projects.length === 0 ? (
        <div className="glass mt-4 rounded-3xl p-10 text-center">
          <p className="font-semibold text-slate-900">Vous n&apos;avez pas encore de logiciel</p>
          <Link href="/creer" className="btn btn-primary mt-5">Créer mon premier logiciel</Link>
        </div>
      ) : list.length === 0 ? (
        <div className="glass mt-4 rounded-2xl p-8 text-center text-sm text-slate-600">
          Aucun logiciel ne correspond. <button className="text-blue-700 underline" onClick={() => { setQ(""); setFilter("tous"); }}>Réinitialiser les filtres</button>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p, i) => <ProjectCard key={p.id} project={p} delay={Math.min(i, 8) * 50} />)}
        </div>
      )}
    </div>
  );
}
