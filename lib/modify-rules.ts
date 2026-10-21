import { MODULES } from "./modules";
import { normalize } from "./generator";
import { toKey, type AppSpec, type Entity, type FieldType } from "./spec";

export type ModifyResult = { ok: true; spec: AppSpec; summary: string } | { ok: false; message: string };

const COLORS: Record<string, string> = {
  vert: "#16a34a",
  bleu: "#2563eb",
  rouge: "#dc2626",
  orange: "#ea580c",
  jaune: "#ca8a04",
  violet: "#7c3aed",
  rose: "#db2777",
  noir: "#111827",
  gris: "#4b5563",
  marron: "#92400e",
  turquoise: "#0d9488",
  blanc: "#f8fafc",
  or: "#b45309",
};

function guessType(label: string): FieldType {
  const t = normalize(label);
  if (/telephone|tel\b|portable|whatsapp|numero de tel/.test(t)) return "phone";
  if (/mail/.test(t)) return "email";
  if (/date|jour|echeance|naissance/.test(t)) return "date";
  if (/prix|montant|cout|salaire|loyer|tarif|total|avance|reste/.test(t)) return "money";
  if (/nombre|quantite|qte|age|stock/.test(t)) return "number";
  if (/note|commentaire|description|remarque|adresse complete/.test(t)) return "longtext";
  return "text";
}

function findEntityByWords(spec: AppSpec, text: string): Entity | undefined {
  const t = normalize(text);
  return spec.entities.find((e) => {
    const names = [e.key, normalize(e.label), normalize(e.labelPlural)];
    return names.some((n) => n.length > 2 && (t.includes(n) || t.includes(n.replace(/s$/, ""))));
  });
}

/**
 * Modifications par règles (sans IA) : reconnaît les demandes les plus courantes.
 * Retourne un message clair quand la demande n'est pas reconnue, sans rien modifier.
 */
export function modifyWithRules(spec: AppSpec, instruction: string): ModifyResult {
  const s: AppSpec = structuredClone(spec);
  const raw = instruction.trim();
  const t = normalize(raw);

  // Couleurs
  if (/couleur|theme/.test(t)) {
    const found = Object.keys(COLORS).filter((c) => new RegExp(`\\b${c}\\b`).test(t));
    if (!found.length) return { ok: false, message: "Précisez la couleur souhaitée (ex. « vert et blanc »)." };
    const main = found.find((c) => c !== "blanc") ?? found[0]!;
    s.theme.primary = COLORS[main]!;
    const second = found.find((c) => c !== main);
    if (second) s.theme.accent = COLORS[second]!;
    return { ok: true, spec: s, summary: `Couleurs changées : ${found.join(" et ")}.` };
  }

  // Export PDF / CSV
  if (/export/.test(t) && /pdf/.test(t)) {
    s.features.pdfExport = true;
    return { ok: true, spec: s, summary: "Export PDF activé sur toutes les pages (impression / enregistrement en PDF)." };
  }
  if (/export/.test(t) && /(csv|excel)/.test(t)) {
    s.features.csvExport = true;
    return { ok: true, spec: s, summary: "Export CSV (compatible Excel) activé." };
  }

  // Recherche : déjà incluse
  if (/recherche/.test(t)) {
    return { ok: false, message: "La recherche est déjà disponible sur chaque page (champ « Rechercher… » au-dessus du tableau). Aucune modification nécessaire." };
  }

  // Statistiques mensuelles
  if (/statisti|graphique/.test(t) && /mois|mensuel/.test(t)) {
    const target = findEntityByWords(s, t) ?? s.entities.find((e) => e.fields.some((f) => f.type === "money"));
    if (!target) return { ok: false, message: "Aucune table avec un montant n'a été trouvée pour calculer des statistiques mensuelles." };
    const money = target.fields.find((f) => f.type === "money");
    const date = target.fields.find((f) => f.type === "date");
    s.dashboard.push({ type: "monthly", label: `${target.labelPlural} par mois${money ? " (FCFA)" : ""}`, entity: target.key, field: money?.key, dateField: date?.key });
    return { ok: true, spec: s, summary: `Statistiques mensuelles ajoutées pour ${target.labelPlural.toLowerCase()}.` };
  }

  // Permissions employé
  if (/(employe|employes|personnel|caissier|serveur)/.test(t) && /(consulter|voir|lire)/.test(t) && /sans/.test(t)) {
    const target = findEntityByWords(s, t.replace(/employe\w*/g, "")) ?? s.entities[0]!;
    const protectedFields = /prix|montant|tarif/.test(t) ? target.fields.filter((f) => f.type === "money").map((f) => f.key) : [];
    target.permissions = {
      ...target.permissions,
      employee: protectedFields.length
        ? { read: true, create: true, update: true, delete: false, readonlyFields: protectedFields }
        : { read: true, create: false, update: false, delete: false, readonlyFields: [] },
    };
    return {
      ok: true,
      spec: s,
      summary: protectedFields.length
        ? `Les employés peuvent consulter et saisir des ${target.labelPlural.toLowerCase()}, sans modifier : ${target.fields.filter((f) => protectedFields.includes(f.key)).map((f) => f.label).join(", ")}.`
        : `Les employés peuvent seulement consulter les ${target.labelPlural.toLowerCase()}.`,
    };
  }

  // Ajout d'un champ
  const fieldMatch = raw.match(/ajoute[rz]?\s+(?:un|une|le|la)?\s*(?:champ|colonne|case)\s+(?:pour\s+(?:le|la|les|l')?\s*|de\s+|du\s+|d')?(.+?)(?:\s+(?:dans|aux?|à|a|sur|pour)\s+(?:la\s+table\s+|la\s+page\s+|les\s+|la\s+|le\s+|l')?(.+))?$/i);
  if (fieldMatch) {
    const label = fieldMatch[1]!.trim().replace(/[.!]$/, "");
    const target = (fieldMatch[2] && findEntityByWords(s, fieldMatch[2])) || findEntityByWords(s, label) || s.entities[0]!;
    const key = toKey(label);
    if (target.fields.some((f) => f.key === key)) return { ok: false, message: `Le champ « ${label} » existe déjà dans ${target.labelPlural}.` };
    const type = guessType(label);
    target.fields.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1, 60), type, required: false, showInTable: target.fields.filter((f) => f.showInTable).length < 6 });
    return { ok: true, spec: s, summary: `Champ « ${label} » (${type}) ajouté à ${target.labelPlural}. Les fiches existantes sont conservées, ce champ y sera vide.` };
  }

  // Retrait d'une page
  const removeMatch = t.match(/(?:retire|supprime|enleve)[rz]?\s+(?:la\s+)?page\s+(.+)/);
  if (removeMatch) {
    const target = findEntityByWords(s, removeMatch[1]!);
    if (!target) return { ok: false, message: "Je n'ai pas trouvé cette page dans votre logiciel." };
    if (s.entities.length === 1) return { ok: false, message: "Le logiciel doit garder au moins une page." };
    s.entities = s.entities.filter((e) => e.key !== target.key);
    s.dashboard = s.dashboard.filter((w) => w.entity !== target.key);
    for (const e of s.entities) e.fields = e.fields.map((f) => (f.relation === target.key ? { ...f, type: "text" as const, relation: undefined } : f));
    return { ok: true, spec: s, summary: `Page ${target.labelPlural} retirée. Ses données restent stockées et réapparaîtront si vous restaurez la version précédente.` };
  }

  // Ajout d'une page
  const pageMatch = t.match(/ajoute[rz]?\s+(?:une\s+)?(?:page|module|section|table)\s+(?:pour\s+(?:gerer|suivre)\s+|de\s+gestion\s+des?\s+|des?\s+|du\s+)?(?:les\s+|la\s+|le\s+)?(.+)/);
  if (pageMatch) {
    const subject = pageMatch[1]!.replace(/[.!]$/, "").trim();
    const mod = MODULES.find((m) => m.keywords.some((k) => subject.includes(k)) || subject.includes(normalize(m.entity.labelPlural)));
    if (mod) {
      if (s.entities.some((e) => e.key === mod.entity.key)) return { ok: false, message: `La page ${mod.entity.labelPlural} existe déjà.` };
      s.entities.push(structuredClone(mod.entity));
      const keys = new Set(s.entities.map((e) => e.key));
      const last = s.entities[s.entities.length - 1]!;
      last.fields = last.fields.map((f) => (f.type === "relation" && (!f.relation || !keys.has(f.relation)) ? { ...f, type: "text" as const, relation: undefined } : f));
      s.dashboard.push(...mod.widgets);
      return { ok: true, spec: s, summary: `Page ${mod.entity.labelPlural} ajoutée (${mod.entity.fields.map((f) => f.label).join(", ")}).` };
    }
    const label = subject.charAt(0).toUpperCase() + subject.slice(1, 60);
    const key = toKey(subject);
    if (s.entities.some((e) => e.key === key)) return { ok: false, message: `La page ${label} existe déjà.` };
    s.entities.push({
      key,
      label,
      labelPlural: label,
      icon: "📋",
      description: "",
      fields: [
        { key: "nom", label: "Nom", type: "text", required: true, showInTable: true },
        { key: "date", label: "Date", type: "date", required: false, showInTable: true },
        { key: "statut", label: "Statut", type: "select", options: ["Actif", "En attente", "Terminé"], required: false, showInTable: true },
        { key: "notes", label: "Notes", type: "longtext", required: false, showInTable: false },
      ],
      permissions: {},
    });
    return { ok: true, spec: s, summary: `Page ${label} ajoutée avec des champs de base (nom, date, statut, notes). Demandez d'autres champs si besoin.` };
  }

  // Renommer le logiciel
  const renameMatch = raw.match(/renomme[rz]?\s+(?:le\s+logiciel|l'application|l’application)\s+(?:en|par)\s+(.+)/i);
  if (renameMatch) {
    s.name = renameMatch[1]!.trim().slice(0, 80);
    return { ok: true, spec: s, summary: `Logiciel renommé « ${s.name} ».` };
  }

  return {
    ok: false,
    message:
      "Je n'ai pas compris cette demande en mode sans IA. Exemples reconnus : « Ajoute un champ téléphone aux clients », « Ajoute une page pour gérer les employés », « Change les couleurs en vert et blanc », « Ajoute des statistiques mensuelles », « Ajoute un export PDF », « Permets à mes employés de consulter les commandes sans modifier les prix ».",
  };
}
