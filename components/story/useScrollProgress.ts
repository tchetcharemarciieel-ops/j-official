"use client";

import { useEffect, useRef, useState } from "react";

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ease = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
/** Avancement local entre deux points de la progression globale (0 → 1). */
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));

/**
 * Progression du défilement dans une section « épinglée » : 0 quand elle arrive en haut
 * de l'écran, 1 quand on l'a entièrement traversée. Mise à jour au rythme de l'affichage.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [p, setP] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const r = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(r);
    if (r) return setP(1);
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const next = span > 0 ? clamp(-rect.top / span) : rect.top <= 0 ? 1 : 0;
      setP((prev) => (Math.abs(prev - next) > 0.0005 ? next : prev));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return { ref, p, reduced };
}

/** Texte révélé mot par mot (flou → net), piloté par une progression 0 → 1. */
export function wordStyle(p: number, i: number, n: number, spread = 0.6) {
  const start = (i / Math.max(1, n)) * spread;
  const t = ease(seg(p, start, start + (1 - spread) + 0.05));
  return { opacity: t, filter: `blur(${(1 - t) * 12}px)`, transform: `translateY(${(1 - t) * 18}px)`, display: "inline-block", whiteSpace: "pre" as const };
}
