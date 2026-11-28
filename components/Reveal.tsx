"use client";

import { useEffect, useRef } from "react";

/** Apparition douce au défilement (vers le haut, depuis la gauche ou la droite, zoom, fondu) ; désactivée si l'utilisateur préfère réduire les animations. */
export function Reveal({ children, className = "", delay = 0, as: Tag = "div", variant = "up" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li"; variant?: "up" | "left" | "right" | "zoom" | "fade" }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      el.classList.add("is-visible", "in-view");
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.add("is-visible", "in-view");
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    // @ts-expect-error -- ref polymorphe
    <Tag ref={ref} className={`reveal ${variant === "up" ? "" : `reveal-${variant}`} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}
