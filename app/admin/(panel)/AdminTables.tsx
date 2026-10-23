"use client";

import { Mail, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/fetcher";
import { useToast } from "@/components/Toaster";

type L = { id: string; name: string; company: string; sector: string; phone: string; email: string; message: string; source: string; status: string; created: string };

const LEAD_STATUS: Record<string, string> = { nouveau: "Nouveau", contacte: "Contacté", client: "Client", sans_suite: "Sans suite" };

export function AdminLeads({ leads }: { leads: L[] }) {
  const router = useRouter();
  const toast = useToast();
  async function setStatus(id: string, status: string) {
    try {
      await api(`/api/admin/leads/${id}`, { method: "PATCH", body: { status } });
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    }
  }
  if (!leads.length) return <p className="glass mt-4 rounded-2xl p-5 text-sm text-slate-600">Aucune demande pour l&apos;instant. Elles arrivent depuis le formulaire « Demander une démonstration » de l&apos;accueil et des pages secteurs.</p>;
  return (
    <ul className="mt-4 grid gap-3 lg:grid-cols-2">
      {leads.map((l) => {
        const phone = l.phone.replace(/\D/g, "");
        return (
          <li key={l.id} className={`glass rounded-2xl p-4 ${l.status === "nouveau" ? "border-blue-300" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{l.name}{l.company && <span className="font-normal text-slate-600"> · {l.company}</span>}</p>
                <p className="text-xs text-slate-500">{l.created} · {l.sector || "secteur non précisé"} · via {l.source || "site"}</p>
              </div>
              <select aria-label={`Statut de ${l.name}`} className="input !min-h-0 w-auto py-1 text-xs" defaultValue={l.status} onChange={(e) => setStatus(l.id, e.target.value)}>
                {Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {l.message && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{l.message}</p>}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {phone && <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-900 hover:bg-slate-200"><Phone className="h-3.5 w-3.5 text-slate-500" aria-hidden />{l.phone}</a>}
              {phone.length >= 8 && <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener" className="rounded-lg border border-[#25D366]/50 bg-[#25D366]/10 px-2.5 py-1.5 font-medium text-green-800 hover:bg-[#25D366]/20">WhatsApp</a>}
              {l.email && <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-900 hover:bg-slate-200"><Mail className="h-3.5 w-3.5 text-slate-500" aria-hidden />{l.email}</a>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
