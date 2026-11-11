import { redirect } from "next/navigation";

/** L'assistant IA a été retiré : l'ancienne adresse renvoie vers l'espace. */
export default function Page() {
  redirect("/espace");
}
