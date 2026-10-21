"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

/**
 * Dictée vocale via la reconnaissance vocale du navigateur (Chrome, Edge, Safari).
 * Le navigateur demande l'autorisation du microphone. Le texte est affiché pour vérification
 * avant toute analyse ; la saisie au clavier reste toujours possible.
 */
export function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<SR | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  function toggle() {
    setError("");
    if (listening) {
      ref.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i]!.isFinal) text += e.results[i]![0].transcript;
      if (text.trim()) onText(text.trim());
    };
    rec.onerror = (e) => setError(e.error === "not-allowed" ? "Accès au microphone refusé. Autorisez-le dans le navigateur ou écrivez votre demande." : "La dictée a échoué. Vous pouvez écrire votre demande.");
    rec.onend = () => setListening(false);
    ref.current = rec;
    rec.start();
    setListening(true);
  }

  if (supported === false) return <p className="text-xs text-slate-500">Dictée vocale indisponible dans ce navigateur : écrivez votre demande.</p>;
  return (
    <div>
      <button type="button" onClick={toggle} disabled={supported === null} className={`btn ${listening ? "btn-danger" : "btn-ghost"}`} aria-pressed={listening}>
        {listening ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
        {listening ? "Arrêter la dictée" : "Dicter"}
      </button>
      {listening && <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-red-700"><span className="h-2 w-2 rounded-full bg-red-600" aria-hidden />Écoute en cours…</span>}
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
