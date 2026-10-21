import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { getProfile } from "@/lib/auth";
import { serverConfigured } from "@/lib/config";
import { AcceptInvite } from "./AcceptInvite";

export const metadata = { title: "Invitation" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!serverConfigured()) redirect("/configuration");
  const profile = await getProfile();
  if (!profile) redirect(`/inscription?next=/invitation/${encodeURIComponent(token)}`);
  return (
    <AuthShell title="Invitation à rejoindre un logiciel" subtitle={`Connecté en tant que ${profile.email}.`}>
      <AcceptInvite token={token} />
    </AuthShell>
  );
}
