"use client";

import { useEffect, useRef } from "react";

/**
 * Scènes plein écran pilotées par le défilement (cahier → caisse → stock → livraison → métiers → appel à l'action).
 * Tout est dessiné en CSS/SVG : aucun fichier vidéo, donc fluide sur iPhone. Chaque scène apparaît, s'anime selon
 * l'avancement du défilement (zoom, glissement, empilement), puis laisse la place à la suivante.
 */
const N = 6;
const JOBS = ["Boutique", "Restaurant", "Pharmacie", "École", "Garage", "Hôtel", "Salon", "Transport", "Bureau"];
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function ScrollScenes() {
  const wrap = useRef<HTMLDivElement>(null);
  const scenes = useRef<(HTMLDivElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const truck = useRef<HTMLDivElement>(null);
  const crates = useRef<(HTMLDivElement | null)[]>([]);
  const sale = useRef<(HTMLDivElement | null)[]>([]);
  const book = useRef<HTMLDivElement>(null);
  const chips = useRef<(HTMLSpanElement | null)[]>([]);
  const bg = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const w = wrap.current;
    if (!w) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = w.getBoundingClientRect();
      const total = Math.max(1, r.height - window.innerHeight);
      const p = clamp(-r.top / total);
      const pos = p * (N - 1); // 0..N-1 : scène courante (décimale)
      if (bar.current) bar.current.style.width = `${p * 100}%`;
      if (bg.current) bg.current.style.filter = `hue-rotate(${p * 70 - 20}deg)`;
      scenes.current.forEach((el, i) => {
        if (!el) return;
        const d = pos - i; // <0 : à venir, >0 : passée
        const vis = clamp((0.62 - Math.abs(d)) * 5);
        const scale = d < 0 ? 0.85 + 0.15 * (1 + d) : 1 + d * 0.35;
        el.style.opacity = String(vis);
        el.style.transform = `translateY(${d < 0 ? -d * 40 : -d * 30}px) scale(${scale})`;
        el.style.visibility = vis > 0.01 ? "visible" : "hidden";
        el.style.pointerEvents = vis > 0.6 ? "auto" : "none";
      });
      if (book.current) book.current.style.transform = `rotate(${-8 + pos * 40}deg) translateY(${pos * 30}px)`;
      sale.current.forEach((el, i) => {
        if (el) el.style.transform = `translateX(${(1 - clamp((pos - 0.5 - i * 0.12) * 4)) * 120}%)`, (el.style.opacity = String(clamp((pos - 0.5 - i * 0.12) * 4)));
      });
      crates.current.forEach((el, i) => {
        if (el) el.style.transform = `translateY(${(1 - clamp((pos - 1.5 - i * 0.08) * 5)) * -260}px)`, (el.style.opacity = String(clamp((pos - 1.5 - i * 0.08) * 6)));
      });
      if (truck.current) truck.current.style.transform = `translateX(${(clamp((pos - 2.4) / 1.2, 0, 1) * 1.3 - 0.3) * 100}vw)`;
      chips.current.forEach((el, i) => {
        if (el) {
          const k = clamp((pos - 3.55 - i * 0.04) * 5);
          el.style.opacity = String(k);
          el.style.transform = `translateY(${(1 - k) * 24}px)`;
        }
      });
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const S = (i: number) => (el: HTMLDivElement | null) => { scenes.current[i] = el; };
  const box = "absolute inset-0 flex flex-col items-center justify-center px-6 text-center will-change-transform";
  const h = "font-display text-3xl font-bold leading-tight text-white sm:text-5xl";
  const sub = "mt-3 max-w-md text-base text-sky-100 sm:text-lg";

  return (
    <div ref={wrap} className="relative" style={{ height: "600vh" }}>
      <div className="sticky top-[4.5rem] h-[calc(100svh-5rem)] overflow-hidden rounded-2xl bg-[#050d24] shadow-lg">
        <div ref={bg} className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,#1d4ed8_0,transparent_55%),radial-gradient(circle_at_20%_90%,#0ea5e9_0,transparent_45%)] opacity-70" />

        {/* 1. Cahier */}
        <div ref={S(0)} className={box}>
          <div ref={book} className="mb-6 h-36 w-28 rounded-lg border-l-8 border-amber-600 bg-amber-50 p-3 shadow-2xl" aria-hidden>
            {[0, 1, 2, 3].map((k) => <div key={k} className="mb-3 h-1 rounded bg-slate-300" />)}
            <div className="text-center text-4xl font-black text-red-500">?</div>
          </div>
          <h3 className={h}>Votre cahier de stock a encore disparu ?</h3>
          <p className={sub}>Ventes oubliées, stock qui manque, crédits jamais payés.</p>
        </div>

        {/* 2. Caisse */}
        <div ref={S(1)} className={box}>
          <div className="mb-6 w-60 rounded-3xl border-4 border-slate-800 bg-white p-3 text-left shadow-2xl" aria-hidden>
            <div className="mb-2 text-xs font-bold text-slate-500">Caisse</div>
            {["Riz 25 kg", "Huile 5 L", "Sucre 1 kg"].map((t, i) => (
              <div key={t} ref={(el) => { sale.current[i] = el; }} className="mb-2 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-slate-800">
                <span>{t}</span><span className="text-emerald-600">✓</span>
              </div>
            ))}
          </div>
          <h3 className={h}>Vendez en quelques secondes</h3>
          <p className={sub}>Chaque vente est notée, sans cahier, sans oubli.</p>
        </div>

        {/* 3. Stock */}
        <div ref={S(2)} className={box}>
          <div className="mb-6 flex h-40 items-end gap-2" aria-hidden>
            {["bg-orange-400", "bg-sky-400", "bg-emerald-400", "bg-rose-400", "bg-amber-300"].map((c, i) => (
              <div key={i} ref={(el) => { crates.current[i] = el; }} className={`${c} w-12 rounded-md border-2 border-white/40 shadow-lg`} style={{ height: [64, 96, 128, 80, 112][i] }} />
            ))}
          </div>
          <h3 className={h}>Votre stock se met à jour tout seul</h3>
          <p className={sub}>Vous voyez ce qu&apos;il reste avant d&apos;être en rupture.</p>
        </div>

        {/* 4. Livraison */}
        <div ref={S(3)} className={box}>
          <div className="relative mb-6 h-24 w-full overflow-hidden" aria-hidden>
            <div className="absolute bottom-2 left-0 right-0 h-1 bg-white/30" />
            <div ref={truck} className="absolute bottom-3 left-0 flex items-end will-change-transform">
              <div className="h-14 w-20 rounded-sm bg-white" />
              <div className="h-9 w-10 rounded-r-lg bg-sky-400" />
              <span className="absolute -bottom-2 left-3 h-5 w-5 rounded-full border-4 border-slate-800 bg-slate-300" />
              <span className="absolute -bottom-2 left-24 h-5 w-5 rounded-full border-4 border-slate-800 bg-slate-300" />
            </div>
          </div>
          <h3 className={h}>Suivez vos livraisons</h3>
          <p className={sub}>Vos clients voient où en est leur colis.</p>
        </div>

        {/* 5. Métiers */}
        <div ref={S(4)} className={box}>
          <h3 className={`${h} mb-6`}>Pour tous les métiers</h3>
          <div className="flex max-w-lg flex-wrap justify-center gap-2">
            {JOBS.map((j, i) => (
              <span key={j} ref={(el) => { chips.current[i] = el; }} className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white sm:text-base">{j}</span>
            ))}
          </div>
        </div>

        {/* 6. Appel */}
        <div ref={S(5)} className={box}>
          <h3 className={h}>Créez votre logiciel aujourd&apos;hui</h3>
          <p className={sub}>En français, en FCFA, gratuit pour commencer.</p>
          <a href="/creer" className="btn btn-primary mt-6">Créer mon logiciel</a>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/15" aria-hidden><div ref={bar} className="h-full bg-sky-400" style={{ width: "0%" }} /></div>
        <p className="absolute inset-x-0 bottom-3 text-center text-xs text-white/60">↓ Faites défiler</p>
      </div>
    </div>
  );
}
