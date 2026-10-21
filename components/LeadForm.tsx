"use client";

import { useState } from "react";
import { STATIC_SITE } from "@/lib/site-mode";

const SECTORS = ["Restauration", "Commerce / boutique", "Garage", "Pharmacie", "École", "Hôtel", "Immobilier", "Transport / livraison", "Salon / services", "PME / gestion interne", "Autre"];

/** Formulaire « Demander une démonstration » : la demande arrive dans l'administration. */
export function LeadForm({ source, defaultSector = "" }: { source: string; defaultSector?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  if (STATIC_SITE) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"),
          company: f.get("company"),
          sector: f.get("sector"),
          phone: f.get("phone"),
          email: f.get("email"),
          message: f.get("message"),
          consent: f.get("consent") === "on",
          website: f.get("website") ?? "",
          source,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string[] };
      if (!res.ok) throw new Error(body.details?.[0]?.split(" : ").pop() ?? body.error ?? "Envoi impossible.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
      setState("idle");
    }
  }

  if (state === "sent")
    return (
      <div role="status" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
        <p className="text-3xl">✅</p>
        <p className="mt-2 font-semibold text-white">Demande envoyée</p>
        <p className="mt-1 text-sm text-emerald-100">Nous vous recontactons pour préparer une démonstration adaptée à votre activité.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <label className="block"><span className="label">Votre nom *</span><input name="name" required maxLength={80} className="input" autoComplete="name" /></label>
      <label className="block"><span className="label">Entreprise</span><input name="company" maxLength={100} className="input" autoComplete="organization" /></label>
      <label className="block"><span className="label">Secteur</span>
        <select name="sector" className="input" defaultValue={defaultSector}>
          <option value="">Choisir…</option>
          {SECTORS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Téléphone / WhatsApp</span><input name="phone" type="tel" inputMode="tel" maxLength={30} className="input" autoComplete="tel" placeholder="+237 6…" /></label>
      <label className="block sm:col-span-2"><span className="label">E-mail</span><input name="email" type="email" maxLength={200} className="input" autoComplete="email" /></label>
      <label className="block sm:col-span-2"><span className="label">Quel problème voulez-vous résoudre ?</span><textarea name="message" rows={3} maxLength={1500} className="input" placeholder="Ex. : je note mes commandes sur un cahier et je perds des ventes…" /></label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className="flex items-start gap-2 text-sm text-slate-300 sm:col-span-2">
        <input name="consent" type="checkbox" required className="mt-1 h-4 w-4" />
        J&apos;accepte d&apos;être recontacté par l&apos;équipe MiniSoft RCA au sujet de ma demande.
      </label>
      {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 sm:col-span-2">{error}</p>}
      <button className="btn btn-primary sm:col-span-2" disabled={state === "sending"}>
        {state === "sending" && <span className="spinner" />}Demander une démonstration gratuite
      </button>
      <p className="text-xs text-slate-500 sm:col-span-2">Un téléphone ou un e-mail suffit. Vos informations servent uniquement à vous recontacter.</p>
    </form>
  );
}
