import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { SupportForm } from "@/components/espace/SupportForm";
import { adminClient } from "@/lib/supabase/admin";
import { fmtDateTime } from "@/lib/status";

export const metadata = { title: "Assistance" };
export const dynamic = "force-dynamic";

const GUIDES = [
  { q: "Modifier mon logiciel", a: "Mes logiciels → Modifier, puis écrivez votre demande (« Ajoute un champ téléphone aux clients »). Vous voyez l'avant/après avant d'appliquer.", href: "/espace/logiciels" },
  { q: "Publier et partager", a: "Publier donne un lien permanent. Invitez ensuite chaque collaborateur depuis Mon équipe : le lien seul ne donne pas accès aux données.", href: "/espace/equipe" },
  { q: "Importer un fichier Excel", a: "Mes données → Importer : vous choisissez la correspondance des colonnes, vérifiez les erreurs, puis confirmez.", href: "/espace/donnees" },
  { q: "Revenir en arrière", a: "Dans un logiciel, onglet Versions → Restaurer. Vos données ne sont jamais effacées par une restauration.", href: "/espace/logiciels" },
];

export default async function Assistance() {
  const p = await requireProfile("/espace/assistance");
  const wa = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const db = adminClient();
  const { data: tickets } = await db.from("support_tickets").select("id,subject,status,created_at").eq("user_id", p.id).order("created_at", { ascending: false }).limit(20);
  const ids = (tickets ?? []).map((t) => t.id);
  const { data: replies } = ids.length ? await db.from("support_messages").select("ticket_id,body,from_admin,created_at").in("ticket_id", ids).order("created_at") : { data: [] as { ticket_id: string; body: string; from_admin: boolean; created_at: string }[] };
  const STATUS_LABEL: Record<string, string> = { nouveau: "Envoyée", en_cours: "En cours de traitement", resolu: "Résolue" };
  return (
    <div className="stagger space-y-6">
      <div className="animate-fade-up">
        <h1 className="font-display text-3xl font-bold text-slate-900">Assistance</h1>
        <p className="mt-1 text-sm text-slate-600">Une question, un blocage ? Nous sommes là.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="glass rounded-2xl p-6 animate-fade-up" aria-labelledby="ecrire">
          <h2 id="ecrire" className="font-display text-lg font-semibold text-slate-900">Écrire à l&apos;équipe</h2>
          <div className="mt-4"><SupportForm phone={p.company_phone} /></div>
          {(tickets ?? []).length > 0 && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="font-semibold text-slate-900">Mes demandes</h3>
              <ul className="mt-3 space-y-3">
                {tickets!.map((t) => (
                  <li key={t.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <p className="flex flex-wrap justify-between gap-2"><span className="font-medium text-slate-900">{t.subject}</span><span className={t.status === "resolu" ? "text-green-700" : "text-slate-500"}>{STATUS_LABEL[t.status] ?? t.status}</span></p>
                    <p className="text-xs text-slate-500">{fmtDateTime(t.created_at)}</p>
                    {(replies ?? []).filter((r) => r.ticket_id === t.id && r.from_admin).map((r, i) => (
                      <p key={i} className="mt-2 whitespace-pre-line rounded-lg bg-blue-50 px-3 py-2 text-slate-800"><span className="block text-xs font-medium text-blue-700">Réponse de l&apos;équipe · {fmtDateTime(r.created_at)}</span>{r.body}</p>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <div className="space-y-4">
          {wa.length >= 8 && (
            <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Bonjour, j'ai besoin d'aide sur MiniSoft RCA (compte ${p.email}).`)}`} target="_blank" rel="noopener" className="flex items-center gap-4 rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 p-5 transition hover:bg-[#25D366]/20 animate-fade-up">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#25D366] text-white" aria-hidden><MessageCircle className="h-5 w-5" /></span>
              <span><span className="block font-semibold text-slate-900">Discuter sur WhatsApp</span><span className="text-sm text-slate-700">Réponse directe de l&apos;équipe MiniSoft RCA</span></span>
            </a>
          )}
          <section className="glass rounded-2xl p-5 animate-fade-up" aria-labelledby="guides">
            <h2 id="guides" className="font-semibold text-slate-900">Guides rapides</h2>
            <ul className="mt-3 space-y-3">
              {GUIDES.map((g) => (
                <li key={g.q}>
                  <details className="group rounded-xl border border-slate-200 bg-slate-50 p-3 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-900">{g.q}<span className="text-blue-700 transition group-open:rotate-45">+</span></summary>
                    <p className="mt-2 text-sm text-slate-700">{g.a}</p>
                    <Link href={g.href} className="mt-2 inline-block text-xs text-blue-700 hover:underline">Y aller →</Link>
                  </details>
                </li>
              ))}
            </ul>
            <Link href="/#faq" className="mt-4 inline-block text-sm text-blue-700 hover:underline">Toutes les questions fréquentes →</Link>
          </section>
        </div>
      </div>
    </div>
  );
}
