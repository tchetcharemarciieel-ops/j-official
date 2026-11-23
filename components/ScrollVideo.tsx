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

const FRAMES = 214;              // images extraites de la vidéo (8 par seconde) : public/videos/frames/f001.webp …
const frameUrl = (i: number) => `/videos/frames/f${String(i + 1).padStart(3, "0")}.webp`;

/**
 * Présentation pilotée par le défilement, en suite d'images dessinées sur un canvas : fonctionne partout
 * (iPhone en économie d'énergie compris), sans dépendre de la lecture vidéo du navigateur.
 */
export function ScrollVideo() {
  const [scene, setScene] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setFallback(true);
  }, []);

  useEffect(() => {
    const w = wrap.current;
    const cv = canvas.current;
    if (!w || !cv || fallback) return;
    const ctx = cv.getContext("2d");
    if (!ctx) { setFallback(true); return; }
    const imgs: (HTMLImageElement | null)[] = new Array(FRAMES).fill(null);
    let shown = -1;
    let target = 0;
    let cur = 0;
    let raf = 0;
    let started = false;
    let alive = true;

    // Dessine l'image chargée la plus proche : jamais d'écran noir en attendant le chargement
    const draw = (i: number) => {
      let k = -1;
      for (let d = 0; d < FRAMES; d++) {
        if (imgs[i - d]) { k = i - d; break; }
        if (imgs[i + d]) { k = i + d; break; }
      }
      const im = k >= 0 ? imgs[k] : null;
      if (!im || k === shown) return;
      shown = k;
      if (cv.width !== im.naturalWidth) { cv.width = im.naturalWidth; cv.height = im.naturalHeight; }
      ctx.drawImage(im, 0, 0);
    };
    const progress = () => {
      const r = w.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      return Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
    };
    const loop = () => {
      raf = 0;
      const diff = target - cur;
      if (Math.abs(diff) > 0.05) {
        cur += diff * 0.3;
        const f = cur / (FRAMES - 1);
        draw(Math.round(cur));
        if (bar.current) bar.current.style.width = `${f * 100}%`;
        setScene(SCENES.reduce((acc, sc, j) => (f >= sc.from ? j : acc), 0));
        raf = requestAnimationFrame(loop);
      }
    };
    const onScroll = () => {
      target = progress() * (FRAMES - 1);
      if (!raf) raf = requestAnimationFrame(loop);
    };

    // 1re image tout de suite, puis le reste par groupes de 8 dès que la section approche
    const load = (i: number) => new Promise<void>((res) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => { imgs[i] = im; res(); };
      im.onerror = () => res();
      im.src = frameUrl(i);
    });
    load(0).then(() => { if (!alive) return; draw(0); setReady(true); });
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const step = saveData ? 2 : 1;
    const startAll = async () => {
      if (started) return;
      started = true;
      const order: number[] = [];
      for (let i = step; i < FRAMES; i += step) order.push(i);
      for (let j = 0; j < order.length && alive; j += 8) {
        await Promise.all(order.slice(j, j + 8).map(load));
        if (alive) draw(Math.round(cur));
      }
    };
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { void startAll(); onScroll(); } }, { rootMargin: "700px 0px" });
    io.observe(w);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      alive = false;
      io.disconnect();
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
          <canvas ref={canvas} width={720} height={405} className="aspect-video w-full" role="img" aria-label="Présentation de MiniSoft RCA : l'image avance quand vous faites défiler la page" />
          <div className="h-1.5 w-full bg-white/15" aria-hidden><div ref={bar} className="h-full bg-sky-400" style={{ width: "0%" }} /></div>
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-center" aria-live="polite">
          <p className="text-base font-bold text-slate-900">{SCENES[scene]!.title}</p>
          <p className="mt-1 text-sm leading-snug text-slate-600">{SCENES[scene]!.text}</p>
          {scene === SCENES.length - 1 && <a href="/creer" className="btn btn-primary mt-3 w-full sm:w-auto">Créer mon logiciel</a>}
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">{ready ? "↓ Faites défiler pour avancer dans la vidéo, ↑ pour reculer" : "Chargement…"}</p>
        <p className="sr-only">Vidéo sans son. Résumé : votre cahier de stock a disparu ? Chaque jour, de l&apos;argent se perd sans qu&apos;on le voie : ventes oubliées, stock qui manque, crédits jamais payés. MiniSoft RCA crée votre logiciel de gestion en quelques minutes, en français et en FCFA, pour tous les métiers. Décrivez votre activité, validez le plan, testez, publiez.</p>
      </div>
    </div>
  );
}
