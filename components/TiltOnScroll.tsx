"use client";

import { useEffect, useRef } from "react";

/**
 * Inclinaison 3D légère qui se redresse au défilement (aperçu de logiciel de l'accueil).
 * Désactivée si l'utilisateur préfère réduire les animations.
 */
export function TiltOnScroll({ children, distance = 360 }: { children: React.ReactNode; distance?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const t = Math.min(1, Math.max(0, window.scrollY / distance));
      const k = 1 - t * (2 - t); // 1 → 0, ralenti à la fin
      el.style.transform = `perspective(1200px) rotateX(${14 * k}deg) rotateY(${-10 * k}deg) scale(${1 - 0.05 * k})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [distance]);
  return (
    <div ref={ref} style={{ transformOrigin: "50% 60%", willChange: "transform" }}>
      {children}
    </div>
  );
}
