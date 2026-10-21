"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/fetcher";

export function SupportForm({ phone }: { phone: string }) {
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
    } catch (err) {
      const details = err instanceof ApiError ? (err.body.details as string[] | undefined) : undefined;
      setError(details?.[0]?.split(" : ").pop() ?? (err instanceof Error ? err.message : "Envoi impossible."));
      setState("idle");
    }
  }
  if (state === "sent")
    return <p role="status" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-100">✅ Demande envoyée. L&apos;équipe MiniSoft RCA vous recontacte par téléphone ou par e-mail.</p>;
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <label className="block"><span className="label">Sujet</span>
        <select name="subject" className="input" defaultValue="Question sur mon logiciel">
          {["Question sur mon logiciel", "Un problème / une erreur", "Importer mes données", "Changer de formule", "Former mon équipe", "Autre"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Votre message</span><textarea name="message" rows={4} className="input" maxLength={2000} placeholder="Décrivez ce que vous voulez faire ou ce qui ne marche pas…" /></label>
      <label className="block"><span className="label">Téléphone pour vous rappeler (facultatif)</span><input name="phone" type="tel" className="input" defaultValue={phone} maxLength={30} placeholder="+236 7…" /></label>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <button className="btn btn-primary" disabled={state === "sending"}>{state === "sending" && <span className="spinner" />}Envoyer ma demande</button>
    </form>
  );
}
