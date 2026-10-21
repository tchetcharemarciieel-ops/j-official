import type { AppSpec } from "./spec";

export type Change = { kind: "added" | "removed" | "changed"; target: string; detail: string };

/** Compare deux versions et liste les changements lisibles par le propriétaire. */
export function diffSpecs(before: AppSpec, after: AppSpec): Change[] {
  const changes: Change[] = [];
  if (before.name !== after.name) changes.push({ kind: "changed", target: "Nom", detail: `${before.name} → ${after.name}` });
  if (before.theme.primary !== after.theme.primary || before.theme.accent !== after.theme.accent)
    changes.push({ kind: "changed", target: "Couleurs", detail: `${before.theme.primary} → ${after.theme.primary}` });
  if (before.theme.logoText !== after.theme.logoText || before.theme.logoUrl !== after.theme.logoUrl)
    changes.push({ kind: "changed", target: "Logo", detail: "Logo modifié" });
  if (before.welcome !== after.welcome) changes.push({ kind: "changed", target: "Texte d'accueil", detail: "Texte modifié" });

  for (const e of after.entities) {
    const prev = before.entities.find((p) => p.key === e.key);
    if (!prev) {
      changes.push({ kind: "added", target: `Page ${e.labelPlural}`, detail: `${e.fields.length} champ(s)` });
      continue;
    }
    if (prev.labelPlural !== e.labelPlural) changes.push({ kind: "changed", target: `Page ${prev.labelPlural}`, detail: `renommée en ${e.labelPlural}` });
    for (const f of e.fields) {
      const pf = prev.fields.find((x) => x.key === f.key);
      if (!pf) changes.push({ kind: "added", target: `${e.labelPlural} › ${f.label}`, detail: `champ ${f.type}` });
      else if (pf.type !== f.type || pf.required !== f.required || pf.label !== f.label || JSON.stringify(pf.options) !== JSON.stringify(f.options))
        changes.push({ kind: "changed", target: `${e.labelPlural} › ${pf.label}`, detail: "propriétés du champ modifiées" });
    }
    for (const pf of prev.fields) if (!e.fields.some((f) => f.key === pf.key)) changes.push({ kind: "removed", target: `${e.labelPlural} › ${pf.label}`, detail: "masqué (données conservées)" });
    if (JSON.stringify(prev.permissions) !== JSON.stringify(e.permissions)) changes.push({ kind: "changed", target: `Permissions ${e.labelPlural}`, detail: "droits par rôle modifiés" });
  }
  for (const p of before.entities) if (!after.entities.some((e) => e.key === p.key)) changes.push({ kind: "removed", target: `Page ${p.labelPlural}`, detail: "retirée (données conservées)" });

  const wb = before.dashboard.map((w) => w.label);
  const wa = after.dashboard.map((w) => w.label);
  for (const l of wa) if (!wb.includes(l)) changes.push({ kind: "added", target: "Tableau de bord", detail: l });
  for (const l of wb) if (!wa.includes(l)) changes.push({ kind: "removed", target: "Tableau de bord", detail: l });

  for (const k of Object.keys(after.features) as (keyof AppSpec["features"])[])
    if (before.features[k] !== after.features[k]) changes.push({ kind: "changed", target: "Fonctionnalité", detail: `${k} ${after.features[k] ? "activé" : "désactivé"}` });

  const ab = JSON.stringify(before.automations);
  if (ab !== JSON.stringify(after.automations)) changes.push({ kind: "changed", target: "Automatisations", detail: `${after.automations.length} automatisation(s)` });
  return changes;
}
