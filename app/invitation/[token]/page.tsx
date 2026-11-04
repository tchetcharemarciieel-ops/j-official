import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { getProfile } from "@/lib/auth";
import { serverConfigured } from "@/lib/config";
import { adminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/tokens";
import { INVITATION_STATE_LABELS, POSITIONS, invitationState } from "@/lib/team";
import { AcceptInvite } from "./AcceptInvite";

export const metadata = { title: "Invitation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Détails publics d'une invitation : entreprise, poste proposé, validité (rien d'autre). */
async function details(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const db = adminClient();
  const { data: inv } = await db.from("invitations").select("*").eq("token_hash", hashToken(token)).maybeSingle();
  if (!inv) return null;
  const [{ data: project }, { data: by }, { data: custom }] = await Promise.all([
    db.from("projects").select("name").eq("id", inv.project_id).single(),
    db.from("profiles").select("full_name,company_name").eq("id", inv.created_by).maybeSingle(),
    db.from("project_positions").select("label").eq("project_id", inv.project_id).eq("key", inv.position ?? "").maybeSingle(),
  ]);
  const position = Object.values(POSITIONS).flat().find((p) => p.key === inv.position)?.label ?? custom?.label ?? "";
  return { state: invitationState(inv), email: inv.email as string, name: (inv.full_name ?? "") as string, company: (by?.company_name || project?.name || "") as string, app: project?.name ?? "", position, invitedBy: by?.full_name ?? "", expires: inv.expires_at as string };
}

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ nouveau?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!serverConfigured()) redirect("/configuration");
  const [profile, d] = await Promise.all([getProfile(), details(token)]);
  if (!d) return <AuthShell title="Invitation introuvable" subtitle="Ce lien n'est pas valide. Demandez à votre responsable de vous renvoyer l'invitation."><Link href="/" className="btn btn-ghost w-full">Accueil</Link></AuthShell>;
  if (d.state !== "en_attente")
    return (
      <AuthShell title={`Invitation ${INVITATION_STATE_LABELS[d.state].toLowerCase()}`} subtitle={d.state === "expiree" ? "Ce lien a expiré : demandez à votre responsable de vous renvoyer l'invitation." : d.state === "acceptee" ? "Cette invitation a déjà été utilisée. Connectez-vous pour ouvrir votre espace." : "Cette invitation a été annulée par l'entreprise."}>
        <Link href="/connexion" className="btn btn-primary w-full">Se connecter</Link>
      </AuthShell>
    );
  const next = `/invitation/${encodeURIComponent(token)}`;
  return (
    <AuthShell title={`Rejoindre ${d.company || d.app}`} subtitle={d.invitedBy ? `Invitation de ${d.invitedBy}` : undefined}>
      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white/70 p-3 text-sm">
        <dt className="text-slate-500">Entreprise</dt><dd className="font-medium">{d.company || d.app}</dd>
        {d.app && d.company && d.app !== d.company && <><dt className="text-slate-500">Logiciel</dt><dd className="font-medium">{d.app}</dd></>}
        <dt className="text-slate-500">Poste proposé</dt><dd className="font-medium">{d.position || "Membre de l'équipe"}</dd>
        <dt className="text-slate-500">Pour</dt><dd className="font-medium">{d.name ? `${d.name} · ` : ""}{d.email}</dd>
        <dt className="text-slate-500">Valable jusqu&apos;au</dt><dd className="font-medium">{new Date(d.expires).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</dd>
      </dl>
      {profile ? (
        <>
          <AcceptInvite token={token} email={profile.email} invitedEmail={d.email} needPassword={sp.nouveau === "1"} />
          <form action="/auth/signout" method="post" className="mt-2">
            <input type="hidden" name="next" value={`/connexion?next=${encodeURIComponent(next)}`} />
            <button className="w-full text-center text-sm text-slate-600 underline">Utiliser un autre compte</button>
          </form>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">Créez votre propre compte avec l&apos;adresse <b>{d.email}</b>, puis acceptez l&apos;invitation. Personne d&apos;autre ne connaîtra votre mot de passe.</p>
          <Link href={`/inscription?next=${encodeURIComponent(next)}&email=${encodeURIComponent(d.email)}`} className="btn btn-primary w-full">Créer mon compte</Link>
          <Link href={`/connexion?next=${encodeURIComponent(next)}`} className="btn btn-ghost w-full">J&apos;ai déjà un compte</Link>
        </div>
      )}
    </AuthShell>
  );
}
