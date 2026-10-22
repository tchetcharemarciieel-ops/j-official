"use client";

import { ExternalLink, FlaskConical, Link2, Pencil, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import { SITE_URL } from "@/lib/config";
import { ROLE_LABELS } from "@/lib/spec";
import { STATUS, fmtDate } from "@/lib/status";
import type { EspaceProject } from "@/lib/espace";

const SHORT: Record<string, string> = { failed: "À corriger", generation: "Génération", preparation: "Préparation" };

/** Carte d'un logiciel avec ses actions réelles (vérifiées côté serveur selon le rôle). */
export function ProjectCard({ project: p, delay = 0, compact = false }: { project: EspaceProject; delay?: number; compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const manage = p.role === "owner" || p.role === "admin";
  const st = STATUS[p.status] ?? STATUS.preparation!;
  const url = `${SITE_URL}/apps/${p.slug}`;
  const hasPublished = Boolean(p.publishedVersion);
  const outdated = hasPublished && p.publishedVersion !== p.draftVersion;

  async function publish() {
    setBusy("publish");
    try {
      const action = p.status === "suspended" ? "resume" : "publish";
      await api(`/api/projects/${p.id}/publish`, { body: { action } });
      toast("success", action === "resume" ? `« ${p.name} » est de nouveau en ligne.` : `« ${p.name} » est publié.`);
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Publication impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!hasPublished) return toast("info", "Publiez d'abord ce logiciel pour obtenir son lien.");
    try {
      await navigator.clipboard.writeText(url);
      toast("success", "Lien copié : vous pouvez le coller dans WhatsApp.");
    } catch {
      toast("error", `Copie impossible. Voici le lien : ${url}`);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await api(`/api/projects/${p.id}`, { method: "DELETE", body: { confirm: typed } });
      toast("success", `« ${p.name} » a été supprimé.`);
      setConfirmDelete(false);
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Suppression impossible.");
    } finally {
      setBusy(null);
    }
  }

  const publishLabel = p.status === "suspended" ? "Réactiver" : !hasPublished ? "Publier" : outdated ? "Republier" : "Publié ✓";
  const btn = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <article className="glass lift flex h-full flex-col rounded-2xl p-5 animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start gap-3">
        {p.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: p.primary }}>{p.logoText}</span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-900">{p.name}</h3>
          <p className="text-xs text-slate-500">{p.sector || "—"} · {ROLE_LABELS[p.role]}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${st.cls}`} title={st.label}>{SHORT[p.status] ?? st.label}</span>
      </div>
      {!compact && p.description && <p className="mt-3 line-clamp-2 text-sm text-slate-700">{p.description}</p>}
      {p.entities.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {p.entities.slice(0, compact ? 3 : 6).map((e) => <span key={e.key} className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">{e.label}</span>)}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Créé le {fmtDate(p.createdAt)} · v{p.draftVersion}{hasPublished ? ` · en ligne v${p.publishedVersion}` : ""}{outdated ? " · modifications non publiées" : ""}
      </p>
      <div className="flex-1" />
      <div className="mt-4 grid grid-cols-3 gap-2">
        {hasPublished && p.status !== "suspended" ? (
          <a href={`/apps/${p.slug}`} target="_blank" rel="noopener" className={`${btn} bg-slate-100 text-slate-900 hover:bg-slate-200`}><ExternalLink className="h-3.5 w-3.5" aria-hidden />Ouvrir</a>
        ) : (
          <Link href={manage ? `/projets/${p.id}` : "#"} aria-disabled={!manage} className={`${btn} bg-slate-100 text-slate-900 hover:bg-slate-200 ${manage ? "" : "pointer-events-none opacity-50"}`}><ExternalLink className="h-3.5 w-3.5" aria-hidden />Ouvrir</Link>
        )}
        {manage ? (
          <>
            <Link href={`/projets/${p.id}?onglet=assistant`} className={`${btn} bg-slate-100 text-slate-900 hover:bg-slate-200`}><Pencil className="h-3.5 w-3.5" aria-hidden />Modifier</Link>
            <Link href={`/projets/${p.id}?onglet=tests`} className={`${btn} bg-slate-100 text-slate-900 hover:bg-slate-200`}><FlaskConical className="h-3.5 w-3.5" aria-hidden />Tester</Link>
            <button onClick={publish} disabled={busy !== null || (hasPublished && !outdated && p.status !== "suspended")} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
              {busy === "publish" ? <span className="spinner" /> : <Send className="h-3.5 w-3.5" aria-hidden />}{publishLabel}
            </button>
            <button onClick={copy} disabled={busy !== null} className={`${btn} bg-slate-100 text-slate-900 hover:bg-slate-200`} title={hasPublished ? url : "Publiez d'abord le logiciel"}><Link2 className="h-3.5 w-3.5" aria-hidden />Copier le lien</button>
            <button onClick={() => (p.role === "owner" ? (setTyped(""), setConfirmDelete(true)) : toast("info", "Seul le propriétaire peut supprimer ce logiciel."))} disabled={busy !== null} className={`${btn} bg-red-50 text-red-700 hover:bg-red-100`}><Trash2 className="h-3.5 w-3.5" aria-hidden />Supprimer</button>
          </>
        ) : (
          <p className="col-span-2 self-center text-xs text-slate-500">Accès {ROLE_LABELS[p.role].toLowerCase()} : utilisation uniquement.</p>
        )}
      </div>

      {confirmDelete &&
        createPortal(
          <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/40 p-4" role="alertdialog" aria-modal="true" aria-labelledby={`del-${p.id}`}>
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" style={{ animation: "pop-in 0.18s ease-out" }}>
              <h2 id={`del-${p.id}`} className="font-display text-lg font-semibold text-slate-900">Supprimer « {p.name} » ?</h2>
              <p className="mt-2 text-sm text-slate-700">Le logiciel, ses versions, ses sauvegardes et <strong>toutes ses données</strong> seront effacés définitivement. Ses membres perdront l&apos;accès.</p>
              <p className="mt-3 text-sm text-slate-600">Pensez à exporter vos données avant (Mes données). Pour confirmer, saisissez <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-900">{p.slug}</code> :</p>
              <input className="input mt-2" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label="Identifiant du logiciel" />
              <div className="mt-5 flex gap-2">
                <button className="btn btn-ghost flex-1" onClick={() => setConfirmDelete(false)}>Annuler</button>
                <button className="btn btn-danger flex-1" disabled={typed !== p.slug || busy === "delete"} onClick={remove}>{busy === "delete" && <span className="spinner" />}Supprimer définitivement</button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </article>
  );
}
