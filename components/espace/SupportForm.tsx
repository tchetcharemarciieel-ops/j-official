"use client";

import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/fetcher";

export function SupportForm({ phone }: { phone: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    setError("");
    try {
      await api("/api/support", { body: { subject: f.get("subject"), message: f.get("message"), phone: f.get("phone") } });
      setState("sent");
      router.refresh();
    } catch (err) {
      const details = err instanceof ApiError ? (err.body.details as string[] | undefined) : undefined;
      setError(details?.[0]?.split(" : ").pop() ?? (err instanceof Error ? err.message : "Envoi impossible."));
      setState("idle");
    }
  }
  if (state === "sent")
    return <p role="status" className="flex items-start gap-2 rounded-2xl border border-green-200 bg-green-50 p-5 text-sm text-green-700"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden /><span>Demande envoyée. Vous recevrez la réponse dans « Mes demandes » ci-dessous et dans vos notifications.</span></p>;
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <label className="block"><span className="label">Sujet</span>
        <select name="subject" className="input" defaultValue="Question sur mon logiciel">
          {["Question sur mon logiciel", "Un problème / une erreur", "Suggestion d'amélioration", "Importer mes données", "Changer de formule", "Former mon équipe", "Autre"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Votre message</span><textarea name="message" rows={4} className="input" maxLength={2000} placeholder="Décrivez ce que vous voulez faire ou ce qui ne marche pas…" /></label>
      <label className="block"><span className="label">Téléphone pour vous rappeler (facultatif)</span><input name="phone" type="tel" className="input" defaultValue={phone} maxLength={30} placeholder="+236 7…" /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="btn btn-primary" disabled={state === "sending"}>{state === "sending" && <span className="spinner" />}Envoyer ma demande</button>
    </form>
  );
}
