import type { Module } from "./modules";
import type { AppSpec } from "./spec";

/** Retire une table du logiciel sans toucher aux données : elles restent stockées et reviennent avec une version précédente. */
export function withoutEntity(spec: AppSpec, key: string): AppSpec {
  return {
    ...spec,
    entities: spec.entities.filter((e) => e.key !== key),
    dashboard: spec.dashboard.filter((w) => w.entity !== key),
    automations: spec.automations.filter((a) => a.trigger.entity !== key),
    workspace: spec.workspace ? { ...spec.workspace, stations: spec.workspace.stations.filter((s) => s.target !== key), hiddenEntities: spec.workspace.hiddenEntities.filter((k) => k !== key) } : spec.workspace,
  };
}

/** Ajoute une fonctionnalité (table + indicateurs) ; les fonctionnalités existantes ne changent pas. */
export function withModule(spec: AppSpec, m: Module): AppSpec {
  if (spec.entities.some((e) => e.key === m.entity.key)) return spec;
  return { ...spec, entities: [...spec.entities, m.entity], dashboard: [...spec.dashboard, ...m.widgets].slice(0, 12) };
}
