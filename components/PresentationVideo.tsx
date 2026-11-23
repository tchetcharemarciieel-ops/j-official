"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Vidéo de présentation de la page d'accueil : muette, chargée seulement à l'approche, lue quand elle
 * est visible et mise en pause quand elle sort de l'écran. Pas de lecture automatique si la personne a
 * demandé de réduire les animations (elle lance alors la vidéo avec le bouton).
 */
export function PresentationVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [wantsPlay, setWantsPlay] = useState(true);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) setWantsPlay(false);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        if (e.isIntersecting && e.intersectionRatio >= 0.4) {
          if (!reduce && wantsPlayRef.current) void v.play().catch(() => undefined);
        } else v.pause();
      },
      { threshold: [0, 0.4, 0.7] },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);
  const wantsPlayRef = useRef(true);
  useEffect(() => { wantsPlayRef.current = wantsPlay; }, [wantsPlay]);
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { setWantsPlay(true); wantsPlayRef.current = true; void v.play().catch(() => undefined); }
    else { setWantsPlay(false); wantsPlayRef.current = false; v.pause(); }
  };
  return (
    <figure className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-lg">
      <video
        ref={ref}
        className="aspect-video w-full object-cover"
        src="/videos/minisoft-rca-presentation.mp4"
        poster="/videos/minisoft-rca-presentation.jpg"
        muted
        loop
        playsInline
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        aria-label="Présentation de MiniSoft RCA : du cahier perdu au logiciel prêt en quelques minutes, pour tous les métiers"
      />
      <button
        type="button"
        onClick={toggle}
        className="absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-slate-900 shadow-md backdrop-blur transition active:scale-95"
        aria-label={playing ? "Mettre la vidéo en pause" : "Lire la vidéo"}
      >
        {playing ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
      </button>
      <figcaption className="sr-only">Vidéo sans son. Résumé : votre cahier de stock a disparu ? Chaque jour, de l&apos;argent se perd sans qu&apos;on le voie : ventes oubliées, stock qui manque, crédits jamais payés. MiniSoft RCA crée votre logiciel de gestion en quelques minutes, en français et en FCFA, pour tous les métiers. Décrivez votre activité, validez le plan, testez, publiez.</figcaption>
    </figure>
  );
}
