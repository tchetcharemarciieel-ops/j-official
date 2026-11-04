import { InvitationLanding } from "./InvitationLanding";

export const metadata = { title: "Invitation", robots: { index: false, follow: false } };

/** Retour du lien de l'e-mail d'invitation : ouverture de la session, puis page de l'invitation. */
export default function Page() {
  return <InvitationLanding />;
}
