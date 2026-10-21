"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Vidéo de présentation animée (sans fichier vidéo) : 6 scènes pilotées par une horloge,
 * avec lecture/pause, chapitres et sous-titres. Les animations dépendent uniquement du temps,
 * donc la pause fige l'image exactement.
 */

type Scene = { id: string; title: string; caption: string; duration: number };

const SCENES: Scene[] = [
  { id: "probleme", title: "Le problème", caption: "À Bangui, beaucoup d'entreprises gèrent encore tout sur un cahier : commandes perdues, stocks inconnus, chiffres introuvables.", duration: 7 },
  { id: "besoin", title: "Votre besoin", caption: "Avec MiniSoft RCA, vous décrivez simplement votre besoin, en français, à l'écrit ou à la voix.", duration: 7.5 },
  { id: "construction", title: "La construction", caption: "La plateforme conçoit votre logiciel : pages, formulaires, tableau de bord, droits de l'équipe, puis le teste.", duration: 7 },
  { id: "logiciel", title: "Votre logiciel", caption: "Votre logiciel est prêt : commandes, stock, dépenses et chiffre d'affaires en FCFA, calculés automatiquement.", duration: 8 },
  { id: "equipe", title: "Votre équipe", caption: "Partagez un lien : votre équipe l'utilise sur téléphone, chacun avec ses droits.", duration: 7.5 },
  { id: "action", title: "À vous", caption: "Votre problème mérite son propre logiciel. Essayez gratuitement, sans programmer.", duration: 8 },
];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
/** Apparition entre deux instants (en secondes de scène). */
const appear = (t: number, start: number, len = 0.6) => ease((t - start) / len);

export function PromoVideo() {
  const [index, setIndex] = useState(0);
  const [t, setT] = useState(0);
  const [dir, setDir] = useState(1);
  const [auto, setAuto] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const scene = SCENES[index]!;

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // L'animation de la scène ne tourne que lorsqu'elle est à l'écran.
  useEffect(() => {
    const el = box.current;
    if (!el || !("IntersectionObserver" in window)) return setVisible(true);
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Horloge de la scène : joue une fois puis s'arrête sur l'image finale
  // (ou passe à la suivante en lecture automatique).
  useEffect(() => {
    if (!visible || reduced) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const dt = last === null ? 0 : (now - last) / 1000;
      last = now;
      setT((v) => Math.min(v + dt, scene.duration));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, reduced, index, scene.duration]);

  const goTo = useCallback((i: number) => {
    const next = (i + SCENES.length) % SCENES.length;
    setDir(next >= index ? 1 : -1);
    setIndex(next);
    setT(0);
  }, [index]);

  useEffect(() => {
    if (auto && t >= scene.duration) {
      if (index === SCENES.length - 1) setAuto(false);
      else goTo(index + 1);
    }
  }, [auto, t, scene.duration, index, goTo]);

  function onTouchStart(e: React.TouchEvent) {
    const p = e.touches[0];
    if (p) touch.current = { x: p.clientX, y: p.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    const p = e.changedTouches[0];
    touch.current = null;
    if (!start || !p) return;
    const dx = p.clientX - start.x;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(p.clientY - start.y)) {
      setAuto(false);
      goTo(index + (dx < 0 ? 1 : -1));
    }
  }

  const st = reduced ? scene.duration : t;
  const enter = reduced ? 1 : appear(t, 0, 0.45);

  return (
    <figure className="mx-auto w-full max-w-5xl">
      <div
        ref={box}
        className="relative aspect-[4/5] w-full touch-pan-y select-none overflow-hidden rounded-3xl border border-white/10 bg-night-950 shadow-2xl shadow-brand-500/20 sm:aspect-video"
        role="region"
        aria-roledescription="présentation animée"
        aria-label={`Présentation de MiniSoft RCA, scène ${index + 1} sur ${SCENES.length} : ${scene.title}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") goTo(index + 1);
          if (e.key === "ArrowLeft") goTo(index - 1);
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_20%_10%,rgba(109,93,252,0.35),transparent),radial-gradient(50%_50%_at_90%_80%,rgba(56,189,248,0.25),transparent)]" />
        <div className="absolute inset-0 flex items-center justify-center px-[5%] pb-[6%] pt-[14%] sm:p-[5%]" style={{ opacity: enter, transform: `translateX(${(1 - enter) * dir * 40}px)` }}>
          {index === 0 && <SceneProblem t={st} />}
          {index === 1 && <SceneNeed t={st} />}
          {index === 2 && <SceneBuild t={st} />}
          {index === 3 && <SceneApp t={st} />}
          {index === 4 && <SceneTeam t={st} />}
          {index === 5 && <SceneCta t={st} />}
        </div>

        <div className="absolute left-[4%] top-[3.5%] rounded-full bg-black/40 px-3 py-1 text-[11px] font-medium text-white/85 backdrop-blur sm:text-xs">
          {index + 1}/{SCENES.length} · {scene.title}
        </div>

        <button onClick={() => { setAuto(false); goTo(index - 1); }} className="absolute left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 sm:grid place-items-center rounded-full bg-black/40 text-xl text-white backdrop-blur transition hover:bg-black/60" aria-label="Scène précédente">
          ‹
        </button>
        <button onClick={() => { setAuto(false); goTo(index + 1); }} className="absolute right-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 sm:grid place-items-center rounded-full bg-black/40 text-xl text-white backdrop-blur transition hover:bg-black/60" aria-label="Scène suivante">
          ›
        </button>

        {index === 0 && t < 4 && !reduced && (
          <div className="pointer-events-none absolute bottom-[4%] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white backdrop-blur" style={{ opacity: appear(t, 1.2, 0.4) }}>
            <span style={{ display: "inline-block", transform: `translateX(${Math.sin(t * 4) * 6}px)` }}>👆</span> Glissez pour avancer
          </div>
        )}
      </div>

      <figcaption className="mt-3 min-h-12 px-2 text-center text-sm text-slate-300 sm:text-base" aria-live="polite">
        {scene.caption}
      </figcaption>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => {
            if (auto) return setAuto(false);
            setAuto(true);
            if (index === SCENES.length - 1 && t >= scene.duration) goTo(0);
          }}
          className="btn btn-ghost !min-h-0 shrink-0 px-3 py-2 text-xs"
          aria-pressed={auto}
        >
          {auto ? "⏸ Pause" : "▶ Lecture auto"}
        </button>
        <button onClick={() => { setAuto(false); goTo(index - 1); }} className="btn btn-ghost !min-h-0 shrink-0 px-3 py-2 sm:hidden" aria-label="Scène précédente">‹</button>
        <div className="flex flex-1 gap-1.5" role="group" aria-label="Scènes">
          {SCENES.map((s, i) => (
            <button key={s.id} onClick={() => { setAuto(false); goTo(i); }} className="group flex-1 py-2" aria-label={`Scène ${i + 1} : ${s.title}`} aria-current={i === index ? "step" : undefined}>
              <span className="block h-1.5 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-sky-glow" style={{ width: `${i < index ? 100 : i === index ? (reduced ? 100 : clamp(t / s.duration) * 100) : 0}%` }} />
              </span>
              <span className="mt-1 hidden truncate text-[10px] text-slate-500 group-hover:text-slate-300 sm:block">{s.title}</span>
            </button>
          ))}
        </div>
        <button onClick={() => { setAuto(false); goTo(index + 1); }} className="btn btn-ghost !min-h-0 shrink-0 px-3 py-2 sm:hidden" aria-label="Scène suivante">›</button>
      </div>
    </figure>
  );
}

/* ---------------------------- Scènes ---------------------------- */

function SceneProblem({ t }: { t: number }) {
  const lines = ["12/10 — 3 plats poulet  ✓", "12/10 — boissons ???", "13/10 — riz 25 kg (reste ?)", "13/10 — avance M. Doko", "14/10 — commande perdue…"];
  const alerts = [
    { text: "Stock épuisé ?", pos: "left-[6%] top-[66%] sm:left-[62%] sm:top-[14%]", at: 2.4 },
    { text: "Combien j'ai vendu ce mois ?", pos: "left-[6%] top-[77%] sm:left-[56%] sm:top-[44%]", at: 3.4 },
    { text: "Commande perdue !", pos: "left-[6%] top-[88%] sm:left-[64%] sm:top-[72%]", at: 4.4 },
  ];
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-[8%] top-[2%] h-[58%] w-[84%] rounded-xl bg-[#f5ecd7] p-[3%] shadow-2xl sm:left-[6%] sm:top-[12%] sm:h-[76%] sm:w-[46%]" style={{ transform: `rotate(-3deg) translateY(${(1 - appear(t, 0.1, 0.8)) * 30}px)` }}>
        <div className="absolute inset-y-0 left-[8%] w-px bg-red-300" />
        {lines.map((l, i) => (
          <p key={i} className="border-b border-sky-200 pl-[12%] font-mono text-[clamp(10px,1.6vw,15px)] leading-[2.2] text-slate-700" style={{ opacity: appear(t, 0.4 + i * 0.35, 0.3), textDecoration: i === 4 ? "line-through" : "none" }}>
            {l}
          </p>
        ))}
      </div>
      {alerts.map((a) => (
        <div key={a.text} className={`absolute rounded-xl border border-red-400/50 bg-red-500/20 px-3 py-1.5 text-[clamp(11px,1.7vw,16px)] font-semibold text-red-100 backdrop-blur ${a.pos}`} style={{ opacity: appear(t, a.at, 0.3), transform: `scale(${0.8 + 0.2 * appear(t, a.at, 0.3)})` }}>
          ⚠️ {a.text}
        </div>
      ))}
    </div>
  );
}

function SceneNeed({ t }: { t: number }) {
  const text = "Je veux gérer les commandes, le stock et les dépenses de mon restaurant à Bangui.";
  const typed = Math.floor(clamp((t - 0.8) / 4) * text.length);
  const pressed = t > 5.6;
  return (
    <div className="w-full max-w-[80%]">
      <p className="mb-[3%] text-center font-display text-[clamp(14px,3vw,30px)] font-bold text-white" style={{ opacity: appear(t, 0.1) }}>
        Décrivez votre problème
      </p>
      <div className="rounded-2xl border border-white/15 bg-white/5 p-[3%] backdrop-blur" style={{ opacity: appear(t, 0.3) }}>
        <p className="min-h-[3em] text-[clamp(10px,2vw,20px)] text-white">
          {text.slice(0, typed)}
          {typed < text.length && <span className="caret">▍</span>}
        </p>
        <div className="mt-[3%] flex items-center justify-between">
          <span className="flex items-center gap-2 text-[clamp(8px,1.4vw,13px)] text-slate-300">
            <span className="grid h-[2em] w-[2em] place-items-center rounded-full bg-red-500/80" style={{ transform: `scale(${1 + 0.12 * Math.sin(t * 6)})` }}>🎙️</span>
            ou dictez-le
          </span>
          <span className="rounded-xl px-[3%] py-[1.5%] text-[clamp(9px,1.6vw,15px)] font-semibold text-white transition" style={{ background: "linear-gradient(135deg,#6d5dfc,#4f8cff)", transform: `scale(${pressed ? 0.94 : 1})`, boxShadow: pressed ? "0 0 0 4px rgba(139,125,255,0.4)" : "none" }}>
            ✨ Créer mon logiciel
          </span>
        </div>
      </div>
    </div>
  );
}

function SceneBuild({ t }: { t: number }) {
  const steps = ["Analyse du besoin", "Tables et formulaires", "Tableau de bord", "Droits de l'équipe", "Tests automatiques"];
  return (
    <div className="grid w-full max-w-[85%] items-center gap-[4%] sm:grid-cols-2">
      <div className="hidden justify-center sm:flex">
        <div className="relative grid aspect-square w-[70%] place-items-center">
          <div className="absolute inset-0 rounded-full border-4 border-white/10" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-sky-glow" style={{ transform: `rotate(${t * 220}deg)` }} />
          <span className="font-display text-[clamp(18px,4vw,40px)] font-bold text-white">{Math.round(clamp(t / 6) * 100)}%</span>
        </div>
      </div>
      <ul className="space-y-[4%]">
        {steps.map((s, i) => {
          const p = clamp((t - 0.4 - i * 1.1) / 1);
          return (
            <li key={s} className="text-[clamp(10px,1.8vw,17px)]" style={{ opacity: 0.35 + 0.65 * appear(t, 0.2 + i * 1.1, 0.3) }}>
              <div className="flex items-center justify-between text-white">
                <span>{s}</span>
                <span className={p >= 1 ? "text-emerald-300" : "text-slate-500"}>{p >= 1 ? "✓" : "…"}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-sky-glow" style={{ width: `${p * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SceneApp({ t }: { t: number }) {
  const ca = Math.round(1245000 * ease((t - 1) / 2.5) / 500) * 500;
  const bars = [35, 52, 44, 68, 60, 88];
  const menu = ["📊 Tableau de bord", "🧾 Commandes", "📦 Stock", "💸 Dépenses", "👥 Clients"];
  return (
    <div className="flex h-[88%] w-[92%] overflow-hidden rounded-2xl bg-slate-50 text-slate-900 shadow-2xl" style={{ transform: `translateY(${(1 - appear(t, 0, 0.8)) * 40}px) scale(${0.96 + 0.04 * appear(t, 0, 0.8)})` }}>
      <aside className="hidden w-[24%] flex-col gap-[4%] bg-white p-[2%] sm:flex">
        <div className="flex items-center gap-2 text-[clamp(8px,1.4vw,14px)] font-semibold">
          <span className="grid h-[2.2em] w-[2.2em] place-items-center rounded-lg bg-orange-500 text-white">CM</span>Chez Mama
        </div>
        {menu.map((m, i) => (
          <span key={m} className={`rounded-lg px-[6%] py-[4%] text-[clamp(7px,1.2vw,12px)] ${i === 0 ? "bg-orange-500 font-semibold text-white" : "text-slate-600"}`} style={{ opacity: appear(t, 0.3 + i * 0.15, 0.3) }}>
            {m}
          </span>
        ))}
      </aside>
      <div className="flex flex-1 flex-col gap-[3%] p-[3%]">
        <div className="grid grid-cols-3 gap-[3%]">
          {[
            { l: "Chiffre d'affaires", v: `${ca.toLocaleString("fr-FR")} FCFA`, at: 0.8 },
            { l: "Commandes du jour", v: String(Math.round(23 * ease((t - 1.2) / 2))), at: 1 },
            { l: "Dépenses du mois", v: `${Math.round(312000 * ease((t - 1.4) / 2)).toLocaleString("fr-FR")} FCFA`, at: 1.2 },
          ].map((k) => (
            <div key={k.l} className="rounded-xl border border-slate-200 bg-white p-[6%]" style={{ opacity: appear(t, k.at, 0.4) }}>
              <p className="text-[clamp(6px,1.1vw,11px)] text-slate-500">{k.l}</p>
              <p className="mt-1 font-bold text-[clamp(9px,1.9vw,19px)]">{k.v}</p>
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-3 gap-[3%]">
          <div className="col-span-2 flex flex-col rounded-xl border border-slate-200 bg-white p-[3%]">
            <p className="text-[clamp(6px,1.1vw,11px)] text-slate-500">Ventes par mois (FCFA)</p>
            <div className="mt-[3%] flex flex-1 items-end gap-[4%]">
              {bars.map((h, i) => (
                <div key={i} className="flex h-full flex-1 items-end">
                  <div className="w-full rounded-t bg-orange-500" style={{ height: `${h * ease((t - 1.8 - i * 0.15) / 0.8)}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-[5%]" style={{ opacity: appear(t, 4.2, 0.4), transform: `translateX(${(1 - appear(t, 4.2, 0.4)) * 20}px)` }}>
            <p className="text-[clamp(6px,1.1vw,11px)] font-semibold text-red-700">Stock presque épuisé</p>
            <p className="mt-[8%] text-[clamp(7px,1.3vw,13px)] text-slate-800">Riz 25 kg — reste 3</p>
            <p className="mt-[4%] text-[clamp(7px,1.3vw,13px)] text-slate-800">Huile 5 L — reste 2</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SceneTeam({ t }: { t: number }) {
  const people = [
    { name: "Gérant", role: "Tout gérer", icon: "👨🏾‍💼", at: 2.2 },
    { name: "Serveuse", role: "Prendre les commandes", icon: "👩🏾", at: 3.2 },
    { name: "Caissier", role: "Encaisser, sans modifier les prix", icon: "🧑🏾", at: 4.2 },
  ];
  return (
    <div className="flex w-full max-w-[92%] flex-col items-center justify-center gap-4 sm:flex-row sm:gap-[6%]">
      <div className="relative aspect-[9/16] w-[34%] sm:w-[26%] rounded-[1.6em] border-[0.4em] border-slate-700 bg-slate-900 p-[2%] shadow-2xl" style={{ transform: `translateY(${(1 - appear(t, 0, 0.8)) * 40}px)` }}>
        <div className="h-full overflow-hidden rounded-[1em] bg-slate-50 text-slate-900">
          <div className="bg-orange-500 px-[8%] py-[6%] text-[clamp(6px,1.2vw,12px)] font-semibold text-white">Chez Mama</div>
          {["CMD-1024 · 12 500 FCFA", "CMD-1025 · 8 000 FCFA", "CMD-1026 · 45 000 FCFA"].map((c, i) => (
            <p key={c} className="mx-[6%] mt-[6%] rounded-md bg-white p-[5%] text-[clamp(5px,1vw,10px)] shadow" style={{ opacity: appear(t, 0.8 + i * 0.4, 0.3) }}>
              {c}
            </p>
          ))}
        </div>
      </div>
      <div className="w-full flex-1 space-y-2 sm:space-y-[4%]">
        <div className="rounded-xl border border-white/15 bg-white/5 px-[4%] py-[3%] text-[clamp(8px,1.6vw,15px)] text-white" style={{ opacity: appear(t, 0.6) }}>
          🔗 minisoft-rca.onrender.com/apps/chez-mama
          <span className="ml-2 rounded bg-[#25D366]/30 px-2 py-0.5 text-[0.8em]" style={{ opacity: appear(t, 1.4) }}>Partagé sur WhatsApp</span>
        </div>
        {people.map((p) => (
          <div key={p.name} className="flex items-center gap-[3%] rounded-xl bg-white/5 px-[4%] py-[2.5%] text-white" style={{ opacity: appear(t, p.at, 0.4), transform: `translateX(${(1 - appear(t, p.at, 0.4)) * 30}px)` }}>
            <span className="text-[clamp(14px,2.6vw,26px)]">{p.icon}</span>
            <span className="text-[clamp(8px,1.5vw,15px)]">
              <strong>{p.name}</strong> <span className="text-slate-400">— {p.role}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SceneCta({ t }: { t: number }) {
  return (
    <div className="text-center">
      <div className="mx-auto grid h-[clamp(40px,8vw,80px)] w-[clamp(40px,8vw,80px)] place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-sky-glow font-bold text-white text-[clamp(14px,2.8vw,28px)] shadow-2xl" style={{ transform: `scale(${0.6 + 0.4 * appear(t, 0, 0.8)}) rotate(${(1 - appear(t, 0, 0.8)) * -20}deg)` }}>
        MS
      </div>
      <p className="mt-[3%] font-display text-[clamp(16px,4vw,44px)] font-bold leading-tight" style={{ opacity: appear(t, 0.6) }}>
        <span className="text-gradient">Votre problème mérite son propre logiciel.</span>
      </p>
      <p className="mt-[2%] text-[clamp(9px,1.7vw,18px)] text-slate-300" style={{ opacity: appear(t, 1.4) }}>
        Gratuit pour commencer · En français · En FCFA
      </p>
      <div className="mt-[4%] flex flex-wrap justify-center gap-3" style={{ opacity: appear(t, 2.2) }}>
        <Link href="/demo" className="btn btn-primary text-[clamp(10px,1.5vw,15px)]">Essayer gratuitement</Link>
        <Link href="/#demonstration" className="btn btn-ghost text-[clamp(10px,1.5vw,15px)]">Demander une démonstration</Link>
      </div>
    </div>
  );
}
