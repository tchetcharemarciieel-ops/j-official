"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Vidéo pilotée par le défilement : la vidéo reste collée en haut de l'écran pendant que la page défile,
 * et son avancement suit le doigt (ou la molette) : on la fait avancer et reculer en défilant. Pour les
 * personnes qui ont réduit les animations, ou si la vidéo ne charge pas, une lecture classique est proposée.
 */
const SCENES: { from: number; title: string; text: string }[] = [
  { from: 0, title: "Votre cahier a encore disparu ?", text: "Ventes oubliées, stock qui manque, crédits jamais payés : chaque jour, de l'argent se perd sans qu'on le voie." },
  { from: 0.22, title: "Un logiciel prêt en quelques minutes", text: "MiniSoft RCA crée votre logiciel de gestion, en français et en FCFA, sur téléphone et ordinateur." },
  { from: 0.5, title: "Pour tous les métiers", text: "Boutique, restaurant, pharmacie, école, garage, hôtel, salon, transport, bureau…" },
  { from: 0.74, title: "Comment ça marche ?", text: "Décrivez votre activité, validez le plan proposé, testez, puis publiez et utilisez-le avec votre équipe." },
  { from: 0.93, title: "Créez votre logiciel aujourd'hui", text: "Gratuit pour commencer." },
];

export function ScrollVideo() {
  const [scene, setScene] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setFallback(true);
  }, []);

  useEffect(() => {
    const v = vid.current;
    const w = wrap.current;
    if (!v || !w || fallback) return;
    let target = 0;
    let cur = 0;
    let raf = 0;
    let dur = 0;
    const progress = () => {
      const r = w.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      return Math.min(1, Math.max(0, -r.top / Math.max(1, total) + 0.0));
    };
    const loop = () => {
      raf = 0;
      if (!dur) return;
      const diff = target - cur;
      if (Math.abs(diff) > 0.015) {
        cur += diff * 0.25;
        v.currentTime = Math.min(dur - 0.05, Math.max(0, cur));
        if (bar.current) bar.current.style.width = `${(cur / dur) * 100}%`;
        const f = cur / dur;
        setScene(SCENES.reduce((acc, sc, i) => (f >= sc.from ? i : acc), 0));
        raf = requestAnimationFrame(loop);
      }
    };
    const onScroll = () => {
      if (!dur) return;
      target = progress() * dur;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onMeta = () => {
      dur = v.duration || 0;
      // Réveille le décodeur (iOS) : lecture muette immédiate puis pause, sans que la vidéo ne tourne.
      void v.play().then(() => v.pause()).catch(() => undefined);
      setReady(true);
      onScroll();
    };
    if (v.readyState >= 1) onMeta();
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("error", () => setFallback(true));
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fallback]);

  if (fallback) {
    return (
      <video className="aspect-video w-full rounded-2xl border border-slate-200 bg-slate-900 object-cover shadow-lg" src="/videos/minisoft-rca-presentation.mp4" poster="/videos/minisoft-rca-presentation.jpg" controls muted playsInline preload="metadata" aria-label="Présentation de MiniSoft RCA" />
    );
  }
  return (
    <div ref={wrap} className="relative" style={{ height: "260vh" }}>
      <div className="sticky top-[4.5rem]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-lg">
          <video ref={vid} className="aspect-video w-full object-cover" src="/videos/minisoft-rca-scrub.mp4" poster="/videos/minisoft-rca-presentation.jpg" muted playsInline preload="auto" aria-label="Présentation de MiniSoft RCA : la vidéo avance quand vous faites défiler la page" />
          <div className="h-1.5 w-full bg-white/15" aria-hidden><div ref={bar} className="h-full bg-sky-400" style={{ width: "0%" }} /></div>
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-center" aria-live="polite">
          <p className="text-base font-bold text-slate-900">{SCENES[scene]!.title}</p>
          <p className="mt-1 text-sm leading-snug text-slate-600">{SCENES[scene]!.text}</p>
          {scene === SCENES.length - 1 && <a href="/creer" className="btn btn-primary mt-3 w-full sm:w-auto">Créer mon logiciel</a>}
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">{ready ? "↓ Faites défiler pour avancer dans la vidéo, ↑ pour reculer" : "Chargement de la vidéo…"}</p>
        <p className="sr-only">Vidéo sans son. Résumé : votre cahier de stock a disparu ? Chaque jour, de l&apos;argent se perd sans qu&apos;on le voie : ventes oubliées, stock qui manque, crédits jamais payés. MiniSoft RCA crée votre logiciel de gestion en quelques minutes, en français et en FCFA, pour tous les métiers. Décrivez votre activité, validez le plan, testez, publiez.</p>
      </div>
    </div>
  );
}
