"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Box = { x: number; y: number; w: number; h: number };

// useLayoutEffect côté navigateur seulement (évite l'avertissement au rendu serveur).
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Suit la position de l'onglet actif (élément portant data-tab={active}) dans un conteneur
 * positionné, pour faire glisser un indicateur d'un onglet à l'autre.
 * Pas d'animation au premier affichage : l'indicateur apparaît directement à sa place.
 */
export function useSlidingIndicator<T extends HTMLElement>(active: string | null | undefined) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [animate, setAnimate] = useState(false);

  useIsoLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const el = active ? root.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`) : null;
      setBox(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [active]);

  useEffect(() => {
    if (!box || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [box, animate]);

  return { ref, box, animate };
}

/** Pastille qui glisse derrière l'onglet actif. Le conteneur doit être en position relative. */
export function SlidingPill({ box, animate, className = "", style }: { box: Box | null; animate: boolean; className?: string; style?: React.CSSProperties }) {
  if (!box) return null;
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute left-0 top-0 ${animate ? "tab-slide" : ""} ${className}`}
      style={{ transform: `translate3d(${box.x}px, ${box.y}px, 0)`, width: box.w, height: box.h, ...style }}
    />
  );
}

/**
 * Encoche arrondie : un disque coloré qui glisse au-dessus de l'onglet actif et « creuse » la barre
 * grâce à une bordure de la couleur du fond de page.
 */
export function SlidingNotch({ box, animate, size = 52, color, ring }: { box: Box | null; animate: boolean; size?: number; color: string; ring: string }) {
  if (!box) return null;
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute left-0 top-0 rounded-full ${animate ? "tab-slide" : ""}`}
      style={{ transform: `translate3d(${box.x + box.w / 2 - size / 2}px, ${-size / 2}px, 0)`, width: size, height: size, background: color, border: `5px solid ${ring}` }}
    />
  );
}
