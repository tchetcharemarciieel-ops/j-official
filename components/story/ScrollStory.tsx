"use client";

import Link from "next/link";
import { Banknote, ClipboardList, Package, ReceiptText, TriangleAlert, UserCog, UserRound, Users } from "lucide-react";
import { siteHref } from "@/lib/site-mode";
import { clamp, ease, seg, useScrollProgress, wordStyle } from "./useScrollProgress";

/**
 * Histoire de MiniSoft RCA racontée au défilement : chaque chapitre reste épinglé à l'écran
 * pendant que l'on fait défiler, et ses animations suivent le doigt (ou la molette).
 */
export function ScrollStory() {
  return (
    <div aria-label="L'histoire de MiniSoft RCA" className="relative bg-[#050816] text-white">
      <Chaos />
      <Orb />
      <Network />
      <Expenses />
      <Profit />
      <Spaces />
      <Finale />
    </div>
  );
}

function Pinned({ height, children, label, sectionRef }: { height: number; children: React.ReactNode; label: string; sectionRef: React.RefObject<HTMLElement | null> }) {
  return (
    <section ref={sectionRef} aria-label={label} style={{ height: `${height}vh` }} className="relative">
      <div className="sticky top-0 flex h-dvh items-center justify-center overflow-hidden">{children}</div>
    </section>
  );
}

function Words({ text, p, className = "", spread = 0.6 }: { text: string; p: number; className?: string; spread?: number }) {
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden style={wordStyle(p, i, words.length, spread)}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

/* Générateur déterministe : mêmes feuilles à chaque affichage (pas de différence serveur/navigateur). */
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const PAPERS = Array.from({ length: 34 }, (_, i) => ({
  angle: r2(rand(i + 1) * Math.PI * 2),
  dist: r2(28 + rand(i + 7) * 46),
  rot: r2((rand(i + 13) - 0.5) * 720),
  w: r2(5 + rand(i + 21) * 7),
  tone: i % 7 === 0 ? "#f97316" : i % 5 === 0 ? "#f5ecd7" : "#e8ebf5",
  delay: rand(i + 31) * 0.12,
}));

/* 1. Le chaos des cahiers */
function Chaos() {
  const { ref, p } = useScrollProgress<HTMLElement>();
  const questions = ["Votre chiffre d'affaires d'hier ?", "Qui vous doit encore de l'argent ?", "Combien de sacs de riz en stock ?"];
  const implode = ease(seg(p, 0.72, 0.95));
  return (
    <Pinned height={320} label="Le problème" sectionRef={ref}>
      <div className="absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_50%,rgba(249,115,22,0.12),transparent)]" />
      {PAPERS.map((s, i) => {
        const out = ease(seg(p, 0.02 + s.delay, 0.4 + s.delay));
        const d = s.dist * out * (1 - implode);
        const x = Math.cos(s.angle) * d;
        const y = Math.sin(s.angle) * d * 0.62;
        return (
          <div
            key={i}
            aria-hidden
            className="absolute left-1/2 top-1/2 rounded-[2px] shadow-lg"
            style={{
              width: `${s.w}vmin`,
              height: `${r2(s.w * 1.3)}vmin`,
              background: s.tone,
              transform: `translate(-50%,-50%) translate(${x}vmax, ${y}vmax) rotate(${s.rot * out}deg) rotateX(${s.rot * 0.4 * out}deg) scale(${(0.2 + out * 0.8) * (1 - implode * 0.9)})`,
              opacity: clamp(out * 1.4) * (1 - implode),
              willChange: "transform",
            }}
          >
            <div className="mx-[12%] mt-[18%] space-y-[10%] opacity-50">
              {[0, 1, 2, 3].map((k) => <div key={k} className="h-[1.5px] bg-slate-400" />)}
            </div>
          </div>
        );
      })}
      <div className="relative z-10 px-6 text-center">
        <p className="mb-4 text-sm uppercase tracking-[0.3em] text-orange-300/80" style={{ opacity: 1 - seg(p, 0.0, 0.08) }}>
          Faites défiler ↓
        </p>
        {questions.map((q, i) => {
          const a = 0.1 + i * 0.2;
          const local = seg(p, a, a + 0.18);
          const visible = local > 0 && local < 1;
          return (
            <h2
              key={q}
              className="absolute left-1/2 top-1/2 w-[92vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 font-display text-[clamp(28px,6vw,72px)] font-bold leading-tight text-white"
              style={{ opacity: visible ? Math.sin(local * Math.PI) * 1.4 : 0, filter: `blur(${(1 - Math.sin(local * Math.PI)) * 10}px)`, textShadow: "0 4px 40px rgba(0,0,0,0.8)" }}
            >
              {q}
            </h2>
          );
        })}
        <p className="absolute left-1/2 top-1/2 w-[90vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 text-[clamp(16px,2.6vw,26px)] text-slate-200" style={{ opacity: seg(p, 0.7, 0.8) * (1 - seg(p, 0.92, 1)) }}>
          Si la réponse est dans un cahier, vous la cherchez encore.
        </p>
      </div>
    </Pinned>
  );
}

/* 2. La lumière */
function Orb() {
  const { ref, p } = useScrollProgress<HTMLElement>();
  const grow = ease(seg(p, 0, 0.45));
  return (
    <Pinned height={200} label="La solution" sectionRef={ref}>
      <div aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: `${6 + grow * 34}vmin`, height: `${6 + grow * 34}vmin`, background: "radial-gradient(circle, #fff7d6 0%, #fbbf24 22%, rgba(109,93,252,0.5) 55%, transparent 72%)", filter: `blur(${2 + grow * 6}px)`, opacity: 0.4 + grow * 0.6 }} />
      <div aria-hidden className="absolute left-0 right-0 top-[64%] h-px bg-gradient-to-r from-transparent via-sky-200/70 to-transparent" style={{ transform: `scaleX(${ease(seg(p, 0.1, 0.5))})` }} />
      <h2 className="relative z-10 max-w-4xl px-6 text-center font-display text-[clamp(32px,7vw,88px)] font-bold leading-[1.05] text-white" style={{ textShadow: "0 0 40px rgba(0,0,0,0.6)" }}>
        <Words text="Avec MiniSoft RCA, vous l'avez maintenant." p={seg(p, 0.2, 0.75)} />
      </h2>
    </Pinned>
  );
}

/* 3. Le cerveau et ses connexions */
const NODES = [
  { label: "Commandes", icon: ClipboardList, x: -28, y: -32 },
  { label: "Stock", icon: Package, x: 28, y: -34 },
  { label: "Clients", icon: Users, x: -32, y: 0 },
  { label: "Dépenses", icon: ReceiptText, x: 32, y: -2 },
  { label: "Paiements", icon: Banknote, x: -17, y: 24 },
  { label: "Équipe", icon: UserCog, x: 18, y: 26 },
];
function Network() {
  const { ref, p } = useScrollProgress<HTMLElement>();
  return (
    <Pinned height={260} label="Comment ça marche" sectionRef={ref}>
      <div className="absolute inset-0 grid grid-rows-[auto_1fr] gap-4 px-5 pb-6 pt-[12vh] sm:grid-cols-[minmax(0,380px)_1fr] sm:grid-rows-1 sm:items-center sm:gap-10 sm:px-[6vw] sm:pt-0">
        <div className="relative z-10">
          <p className="text-sm uppercase tracking-[0.25em] text-blue-300" style={{ opacity: seg(p, 0, 0.1) }}>Pas un simple tableur</p>
          <h2 className="mt-3 font-display text-[clamp(28px,4.6vw,60px)] font-bold leading-tight text-white">
            <Words text="Un cerveau pour votre entreprise." p={seg(p, 0.02, 0.3)} />
          </h2>
          <p className="mt-4 max-w-sm text-[clamp(14px,1.6vw,18px)] text-slate-300" style={{ opacity: seg(p, 0.3, 0.45), transform: `translateY(${(1 - seg(p, 0.3, 0.45)) * 16}px)` }}>
            Il se branche sur votre activité : commandes, stock, clients, dépenses, équipe. Il calcule, il alerte. Vous décidez.
          </p>
        </div>
        <div className="relative h-full min-h-[44vh] w-full">
          <svg className="absolute inset-0 h-full w-full" viewBox="-50 -50 100 100" preserveAspectRatio="none" aria-hidden>
            {NODES.map((n, i) => {
              const t = ease(seg(p, 0.15 + i * 0.07, 0.3 + i * 0.07));
              return <line key={n.label} x1="0" y1="0" x2={n.x * t} y2={n.y * t} stroke="url(#ln)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />;
            })}
            <defs>
              <linearGradient id="ln" gradientUnits="userSpaceOnUse" x1="-40" y1="-40" x2="40" y2="40">
                <stop offset="0" stopColor="#fde68a" />
                <stop offset="1" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
          </svg>
          <div aria-hidden className="absolute left-1/2 top-1/2 h-[16vmin] w-[16vmin] rounded-full" style={{ background: "radial-gradient(circle, #fffbeb 0%, #fbbf24 30%, rgba(251,191,36,0.15) 60%, transparent 72%)", filter: "blur(2px)", transform: `translate(-50%,-50%) scale(${1 + Math.sin(p * 20) * 0.04})` }} />
          {NODES.map((n, i) => {
            const t = ease(seg(p, 0.25 + i * 0.07, 0.35 + i * 0.07));
            return (
              <div key={n.label} className="absolute flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-[clamp(11px,1.4vw,15px)] text-white shadow-xl" style={{ left: `${50 + n.x}%`, top: `${50 + n.y}%`, opacity: t, transform: `translate(-50%,-50%) scale(${0.7 + 0.3 * t})` }}>
                <n.icon className="h-4 w-4 text-blue-300" aria-hidden />
                {n.label}
              </div>
            );
          })}
          <div className="absolute bottom-[4%] left-1/2 w-[min(90%,420px)] rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-[clamp(11px,1.3vw,14px)] text-amber-100" style={{ opacity: seg(p, 0.78, 0.88), transform: `translate(-50%, ${(1 - seg(p, 0.78, 0.88)) * 20}px)` }}>
            <TriangleAlert className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden />Riz 25 kg : il en reste 3. Pensez à commander avant samedi.
          </div>
        </div>
      </div>
    </Pinned>
  );
}

/* 4. Chaque dépense, à sa place */
const EXPENSES = [
  { label: "Facture ENERCA", amount: "48 500", cat: 0 },
  { label: "Achat gaz", amount: "12 000", cat: 1 },
  { label: "Salaire caissière", amount: "75 000", cat: 2 },
  { label: "Transport marchandises", amount: "20 000", cat: 1 },
  { label: "Eau SODECA", amount: "9 500", cat: 0 },
  { label: "Salaire serveur", amount: "60 000", cat: 2 },
];
const CATS = ["Électricité / eau", "Achats", "Salaires"];
function Expenses() {
  const { ref, p } = useScrollProgress<HTMLElement>();
  return (
    <Pinned height={240} label="Les dépenses" sectionRef={ref}>
      <div className="w-full max-w-5xl px-5">
        <h2 className="text-center font-display text-[clamp(30px,6vw,76px)] font-bold leading-tight text-white">
          <Words text="Chaque dépense," p={seg(p, 0, 0.18)} /> <em className="font-serif font-normal italic text-blue-300"><Words text="à sa place." p={seg(p, 0.12, 0.28)} /></em>
        </h2>
        <div className="relative mx-auto mt-[6vh] grid max-w-3xl grid-cols-3 gap-2 sm:gap-4">
          {CATS.map((c, ci) => {
            const items = EXPENSES.filter((e) => e.cat === ci);
            return (
              <div key={c} className="min-h-[34vh] rounded-2xl border border-white/10 bg-white/[0.03] p-2 sm:p-3" style={{ opacity: seg(p, 0.25, 0.35) }}>
                <p className="mb-2 text-center text-[clamp(10px,1.3vw,13px)] font-semibold text-slate-300">{c}</p>
                <div className="space-y-2">
                  {items.map((e) => {
                    const idx = EXPENSES.indexOf(e);
                    const t = ease(seg(p, 0.35 + idx * 0.07, 0.5 + idx * 0.07));
                    const fromX = (1 - ci) * 120 + (idx % 2 ? 40 : -40);
                    return (
                      <div key={e.label} className="rounded-lg bg-white px-2 py-1.5 text-[clamp(9px,1.2vw,12px)] text-slate-800 shadow-lg" style={{ opacity: t, transform: `translate(${(1 - t) * fromX}%, ${(1 - t) * -140}%) rotate(${(1 - t) * (idx % 2 ? 12 : -12)}deg)` }}>
                        <span className="block truncate">{e.label}</span>
                        <strong>{e.amount} FCFA</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-[clamp(13px,1.6vw,17px)] text-slate-400" style={{ opacity: seg(p, 0.85, 0.95) }}>Vous saisissez une dépense ; le logiciel la range et fait les totaux du mois.</p>
      </div>
    </Pinned>
  );
}

/* 5. Combien vous gagnez, vraiment */
function Profit() {
  const { ref, p } = useScrollProgress<HTMLElement>();
  const value = Math.round((2845500 * ease(seg(p, 0.2, 0.65))) / 500) * 500;
  const bars = [42, 55, 48, 66, 58, 74, 63, 88];
  return (
    <Pinned height={220} label="Le résultat" sectionRef={ref}>
      <div className="w-full max-w-4xl px-5 text-center">
        <h2 className="font-display text-[clamp(30px,6vw,76px)] font-bold leading-tight text-white">
          <Words text="Combien vous gagnez," p={seg(p, 0, 0.18)} /> <em className="font-serif font-normal italic text-sky-300"><Words text="vraiment ?" p={seg(p, 0.1, 0.25)} /></em>
        </h2>
        <div className="mx-auto mt-[5vh] max-w-2xl rounded-3xl border border-white/10 bg-slate-900/70 p-5 text-left shadow-2xl sm:p-8" style={{ opacity: seg(p, 0.15, 0.25), transform: `perspective(900px) rotateX(${(1 - ease(seg(p, 0.15, 0.4))) * 25}deg)` }}>
          <p className="text-sm text-slate-400">Bénéfice du mois · Chez Mama, Bangui</p>
          <p className="mt-2 font-display text-[clamp(30px,6vw,60px)] font-bold tabular-nums text-white">{value.toLocaleString("fr-FR")} <span className="text-[0.5em] text-slate-400">FCFA</span></p>
          <div className="mt-5 flex h-28 items-end gap-2">
            {bars.map((h, i) => (
              <div key={i} className="flex h-full flex-1 items-end">
                <div className="w-full rounded-t-md bg-gradient-to-t from-blue-600 to-sky-400" style={{ height: `${h * ease(seg(p, 0.3 + i * 0.04, 0.5 + i * 0.04))}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm" style={{ opacity: seg(p, 0.65, 0.78) }}>
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-emerald-200">Ventes : 4 120 000 FCFA</p>
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-red-200">Dépenses : 1 274 500 FCFA</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500" style={{ opacity: seg(p, 0.8, 0.9) }}>Exemple de démonstration. Avec vos données, les chiffres sont les vôtres.</p>
      </div>
    </Pinned>
  );
}

/* 6. Chacun son espace */
function Spaces() {
  const { ref, p } = useScrollProgress<HTMLElement>();
  const roles = [
    { who: "Gérant", what: "voit tout : ventes, dépenses, bénéfice", icon: UserCog },
    { who: "Serveuse", what: "prend les commandes", icon: UserRound },
    { who: "Caissier", what: "encaisse, sans modifier les prix", icon: Banknote },
  ];
  return (
    <Pinned height={220} label="L'équipe" sectionRef={ref}>
      <div className="grid w-full max-w-6xl items-center gap-8 px-5 sm:grid-cols-2 sm:px-[5vw]">
        <div className="order-2 flex justify-center sm:order-1">
          <div className="relative aspect-[9/18] w-[42vw] max-w-[260px] rounded-[2.2rem] border-[6px] border-slate-700 bg-slate-900 p-2 shadow-2xl sm:w-[22vw]" style={{ transform: `perspective(1000px) rotateY(${(1 - ease(seg(p, 0.05, 0.4))) * -35}deg) rotateZ(${(1 - ease(seg(p, 0.05, 0.4))) * 8}deg) translateY(${(1 - ease(seg(p, 0.05, 0.4))) * 60}px)`, opacity: seg(p, 0, 0.15) }}>
            <div className="h-full overflow-hidden rounded-[1.6rem] bg-slate-50 text-slate-900">
              <div className="bg-orange-500 px-4 py-3 text-sm font-semibold text-white">Chez Mama</div>
              {["CMD-1024 · 12 500 FCFA", "CMD-1025 · 8 000 FCFA", "CMD-1026 · 45 000 FCFA", "CMD-1027 · 6 500 FCFA"].map((c, i) => (
                <p key={c} className="mx-3 mt-3 rounded-lg bg-white p-2.5 text-[11px] shadow" style={{ opacity: seg(p, 0.25 + i * 0.06, 0.35 + i * 0.06) }}>{c}</p>
              ))}
            </div>
          </div>
        </div>
        <div className="order-1 sm:order-2">
          <h2 className="font-display text-[clamp(30px,5.5vw,70px)] font-bold leading-tight text-white">
            <Words text="Chacun son espace." p={seg(p, 0, 0.2)} />
            <br />
            <span className="text-blue-300"><Words text="Vous voyez tout." p={seg(p, 0.12, 0.3)} /></span>
          </h2>
          <ul className="mt-6 space-y-3">
            {roles.map((r, i) => {
              const t = ease(seg(p, 0.35 + i * 0.12, 0.5 + i * 0.12));
              return (
                <li key={r.who} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" style={{ opacity: t, transform: `translateX(${(1 - t) * 40}px)` }}>
                  <r.icon className="h-5 w-5 shrink-0 text-blue-300" aria-hidden />
                  <span className="text-[clamp(13px,1.5vw,16px)] text-slate-200"><strong className="text-white">{r.who}</strong> — {r.what}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Pinned>
  );
}

/* 7. Final */
function Finale() {
  const { ref, p } = useScrollProgress<HTMLElement>();
  return (
    <Pinned height={160} label="Commencer" sectionRef={ref}>
      <div aria-hidden className="absolute left-1/2 top-[38%] h-[30vmin] w-[30vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-200/60 blur-3xl" style={{ opacity: 0.3 + seg(p, 0, 0.5) * 0.5 }} />
      <div className="relative z-10 max-w-4xl px-6 text-center">
        <h2 className="font-display text-[clamp(32px,7vw,90px)] font-bold leading-[1.05] text-white">
          <Words text="Arrêtez de chercher dans vos cahiers." p={seg(p, 0, 0.45)} />
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-[clamp(15px,1.8vw,20px)] text-slate-300" style={{ opacity: seg(p, 0.35, 0.5) }}>
          Décrivez votre problème. Votre logiciel est prêt à tester en quelques minutes, en français et en FCFA.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3" style={{ opacity: seg(p, 0.45, 0.6), transform: `translateY(${(1 - seg(p, 0.45, 0.6)) * 20}px)` }}>
          <Link href={siteHref("/creer")} className="btn btn-primary">Créer mon logiciel</Link>
          <Link href="/#contact" className="btn border border-white/30 text-white hover:bg-white/10">Présentez votre projet</Link>
        </div>
      </div>
    </Pinned>
  );
}
