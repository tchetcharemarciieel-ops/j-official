"use client";

import { useState } from "react";
import { CURRENCIES, SCHOOL_TYPES, SYSTEMS, defaultMentions, type CurrencyCode, type SchoolType, type SystemId } from "@/lib/ecole/model";
import { useCtx } from "../context";
import { Card, Field } from "../ui";

/** Réglages de l'établissement : identité, système éducatif, périodes, barème et mentions, devise. */
export function SettingsPage() {
  const c = useCtx();
  const s = c.settings;
  const [f, setF] = useState({ name: s.name, school_type: s.school_type, system: s.system, system_note: s.system_note, address: s.address, phone: s.phone, email: s.email, students_count: String(s.students_count), teachers_count: String(s.teachers_count), classes_count: String(s.classes_count), terms: String(s.terms), term_label: s.term_label, scale: String(s.scale), pass_mark: String(s.pass_mark), mentions: s.mentions, currency: s.currency, primary: s.primary, needs: s.needs, bulletin_note: s.bulletin_note });
  const save = () => c.run("settings.save", { ...f, students_count: Number(f.students_count) || 0, teachers_count: Number(f.teachers_count) || 0, classes_count: Number(f.classes_count) || 0, terms: Number(f.terms), scale: Number(f.scale), pass_mark: Number(f.pass_mark) });
  return (
    <div className="space-y-4">
      <Card title="Établissement">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Type"><select className="input" value={f.school_type} onChange={(e) => setF({ ...f, school_type: e.target.value as SchoolType })}>{Object.entries(SCHOOL_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          <Field label="Système éducatif"><select className="input" value={f.system} onChange={(e) => setF({ ...f, system: e.target.value as SystemId })}>{Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Précisions sur le système"><input className="input" value={f.system_note} onChange={(e) => setF({ ...f, system_note: e.target.value })} /></Field>
          <Field label="Adresse"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Téléphone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Couleur"><input className="h-11 w-full cursor-pointer rounded-xl border border-slate-300" type="color" value={f.primary} onChange={(e) => setF({ ...f, primary: e.target.value })} /></Field>
          <Field label="Élèves prévus"><input className="input" type="number" min="0" value={f.students_count} onChange={(e) => setF({ ...f, students_count: e.target.value })} /></Field>
          <Field label="Enseignants prévus"><input className="input" type="number" min="0" value={f.teachers_count} onChange={(e) => setF({ ...f, teachers_count: e.target.value })} /></Field>
          <Field label="Classes prévues"><input className="input" type="number" min="0" value={f.classes_count} onChange={(e) => setF({ ...f, classes_count: e.target.value })} /></Field>
          <Field label="Devise"><select className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as CurrencyCode })}>{Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></Field>
          <Field label="Besoins particuliers de l'établissement" className="sm:col-span-2"><textarea className="input" rows={2} value={f.needs} onChange={(e) => setF({ ...f, needs: e.target.value })} /></Field>
        </div>
      </Card>
      <Card title="Règles de notation" subtitle="Elles servent au calcul des moyennes, des mentions et des bulletins. Changer ces règles ne modifie pas les notes saisies.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Périodes par année"><select className="input" value={f.terms} onChange={(e) => { const n = Number(e.target.value); setF({ ...f, terms: String(n), term_label: n === 2 ? "Semestre" : n === 3 ? "Trimestre" : "Période" }); }}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label="Nom de la période"><select className="input" value={f.term_label} onChange={(e) => setF({ ...f, term_label: e.target.value as "Trimestre" | "Semestre" | "Période" })}><option>Trimestre</option><option>Semestre</option><option>Période</option></select></Field>
          <Field label="Barème (note maximale)"><input className="input" type="number" min="1" value={f.scale} onChange={(e) => setF({ ...f, scale: e.target.value, mentions: defaultMentions(Number(e.target.value) || 20, Number(f.pass_mark) || 10) })} /></Field>
          <Field label="Seuil de réussite"><input className="input" type="number" min="0" value={f.pass_mark} onChange={(e) => setF({ ...f, pass_mark: e.target.value })} /></Field>
        </div>
        <p className="label mt-4">Mentions (à partir de la moyenne)</p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{f.mentions.map((m, i) => <li key={i} className="flex items-center gap-2"><input className="input w-24" type="number" value={m.min} aria-label="Moyenne minimale" onChange={(e) => setF({ ...f, mentions: f.mentions.map((x, k) => (k === i ? { ...x, min: Number(e.target.value) } : x)) })} /><input className="input flex-1" value={m.label} aria-label="Mention" onChange={(e) => setF({ ...f, mentions: f.mentions.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /></li>)}</ul>
        <Field label="Note de bas de bulletin" className="mt-3"><input className="input" value={f.bulletin_note} maxLength={300} onChange={(e) => setF({ ...f, bulletin_note: e.target.value })} /></Field>
      </Card>
      <button className="btn btn-primary" disabled={!c.may("parametres") || !f.name.trim()} onClick={() => void save()}>Enregistrer les réglages</button>
    </div>
  );
}
