"use client";

import { Check, Image as ImageIcon, LayoutGrid, List, Palette, Play, Plus, Trash2, Utensils } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MENU_CATEGORY_LABELS, fmtMoney, type Doc } from "@/lib/venue/model";
import { onlineSettings, type OnlineItem } from "@/lib/venue/online";
import {
  ACCENT_SWATCHES,
  FONT_STACKS,
  MENU_ANIMATIONS,
  MENU_CORNERS,
  MENU_FONTS,
  MENU_LAYOUTS,
  MENU_THEMES,
  accentVisible,
  menuStyle,
  menuTokens,
  onColor,
  type MenuStyle,
} from "@/lib/venue/menu-style";
import { shrinkImage } from "../image";
import { Btn, Card, isMgr, useV } from "../ui";

const LAYOUT_ICONS = { liste: List, grille: LayoutGrid, cartes: ImageIcon } as const;

/**
 * Apparence du menu en ligne : le gérant choisit un thème, sa couleur, la disposition des plats,
 * la police, l'animation, les coins et une image de couverture, avec un aperçu en direct.
 */
export function MenuStyleEditor() {
  const { v, level, act, settings, appName } = useV();
  const o = onlineSettings(settings);
  const saved = menuStyle(o.style);
  const [s, setS] = useState<MenuStyle>(saved);
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState(0);
  const [err, setErr] = useState("");
  const [appPrimary, setAppPrimary] = useState<string | undefined>(undefined);
  const probe = useRef<HTMLDivElement>(null);
  const mgr = isMgr(level);
  useEffect(() => {
    const c = probe.current ? getComputedStyle(probe.current).getPropertyValue("--app-primary").trim() : "";
    if (/^#[0-9a-f]{6}$/i.test(c)) setAppPrimary(c);
  }, []);
  const set = (p: Partial<MenuStyle>) => (setS((x) => ({ ...x, ...p })), p.animation || p.layout ? setReplay((n) => n + 1) : undefined);
  const changed = JSON.stringify(s) !== JSON.stringify(saved);
  const items = (v.data.menu as Doc<OnlineItem>[]).filter((m) => m.data.active).slice(0, 4);
  const { accent } = menuTokens(s, appPrimary);

  return (
    <Card title="Apparence du menu" actions={<Palette className="h-4 w-4 text-slate-400" aria-hidden />}>
      <div ref={probe} className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Group label="Thème">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(MENU_THEMES) as (keyof typeof MENU_THEMES)[]).map((k) => {
                const t = MENU_THEMES[k];
                const on = s.theme === k;
                return (
                  <button key={k} type="button" disabled={!mgr} onClick={() => set({ theme: k, accent: null })} aria-pressed={on} className={`relative overflow-hidden rounded-xl border-2 p-2 text-left transition ${on ? "border-blue-600 ring-2 ring-blue-600/20" : "border-slate-200 hover:border-slate-300"}`} style={{ background: t.bg, color: t.text }}>
                    <span className="flex gap-1">
                      <span className="h-6 flex-1 rounded-md" style={{ background: t.surface, border: `1px solid ${t.border}` }} />
                      <span className="h-6 w-6 rounded-full" style={{ background: t.accent }} />
                    </span>
                    <span className="mt-1.5 block text-xs font-semibold">{t.label}</span>
                    {on && <Check className="absolute right-1.5 top-1.5 h-4 w-4 rounded-full bg-blue-600 p-0.5 text-white" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </Group>

          <Group label="Couleur principale (boutons, prix, catégories)">
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_SWATCHES.map((c) => (
                <button key={c} type="button" disabled={!mgr} onClick={() => set({ accent: c })} aria-label={`Couleur ${c}`} aria-pressed={accent === c} className={`grid h-9 w-9 place-items-center rounded-full border-2 transition ${accent === c ? "scale-110 border-slate-900" : "border-white shadow"}`} style={{ background: c }}>
                  {accent === c && <Check className="h-4 w-4" style={{ color: onColor(c) }} aria-hidden />}
                </button>
              ))}
              <label className="flex items-center gap-1.5 rounded-full border border-slate-300 py-1 pl-1 pr-3 text-xs font-medium">
                <input type="color" value={accent} disabled={!mgr} onChange={(e) => set({ accent: e.target.value })} className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0" />
                Autre couleur
              </label>
              {s.accent && mgr && <button type="button" onClick={() => set({ accent: null })} className="text-xs text-slate-500 underline">Couleur du thème</button>}
            </div>
            {s.accent && !accentVisible(s.accent, s.theme) && <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Cette couleur est trop proche du fond du thème « {MENU_THEMES[s.theme].label} » : les boutons seraient invisibles. Le menu utilise donc la couleur du thème. Choisissez une couleur plus claire ou plus vive.</p>}
          </Group>

          <Group label="Disposition des plats">
            <Choices value={s.layout} options={MENU_LAYOUTS} disabled={!mgr} onChange={(layout) => set({ layout })} icon={(k) => { const I = LAYOUT_ICONS[k]; return <I className="h-4 w-4" aria-hidden />; }} />
          </Group>

          <Group label="Police">
            <Choices value={s.font} options={MENU_FONTS} disabled={!mgr} onChange={(font) => set({ font })} fontOf={(k) => FONT_STACKS[k]} />
          </Group>

          <Group label="Animation des plats">
            <Choices value={s.animation} options={MENU_ANIMATIONS} disabled={!mgr} onChange={(animation) => set({ animation })} />
            {s.animation !== "aucune" && <button type="button" onClick={() => setReplay((n) => n + 1)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700"><Play className="h-3.5 w-3.5" aria-hidden />Rejouer l&apos;animation</button>}
            <p className="mt-1 text-xs text-slate-500">Les plats apparaissent avec cet effet quand le client fait défiler le menu. Les téléphones réglés sur « réduire les animations » affichent le menu sans effet.</p>
          </Group>

          <Group label="Coins des cartes">
            <Choices value={s.corners} options={MENU_CORNERS} disabled={!mgr} onChange={(corners) => set({ corners })} />
          </Group>

          <Group label="Image de couverture (en haut du menu)">
            <div className="flex flex-wrap items-center gap-3">
              {s.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.cover} alt="Couverture" className="h-16 w-28 rounded-lg border border-slate-200 object-cover" />
              ) : (
                <span className="grid h-16 w-28 place-items-center rounded-lg border border-dashed border-slate-300 text-slate-400"><ImageIcon className="h-5 w-5" aria-hidden /></span>
              )}
              {mgr && (
                <label className="btn btn-ghost cursor-pointer !min-h-0 px-3 py-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {s.cover ? "Changer" : "Ajouter une photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try {
                        setErr("");
                        const img = await shrinkImage(f, 1200, "image/jpeg", 380_000);
                        set({ cover: img });
                      } catch (x) {
                        setErr(x instanceof Error ? x.message : "Image illisible.");
                      }
                    }}
                  />
                </label>
              )}
              {mgr && s.cover && <Btn small kind="ghost" onClick={() => set({ cover: null })}><Trash2 className="h-3.5 w-3.5" aria-hidden />Retirer</Btn>}
            </div>
            <p className="mt-1 text-xs text-slate-500">Une belle photo de votre salle, de votre façade ou d&apos;un plat phare.</p>
            {err && <p role="alert" className="mt-1 text-xs text-red-700">{err}</p>}
          </Group>

          {mgr && (
            <div className="flex flex-wrap items-center gap-2">
              <Btn
                busy={busy}
                disabled={!changed}
                onClick={async () => {
                  setBusy(true);
                  const { cover, ...rest } = s;
                  await act("online.style", { ...rest, ...(cover !== saved.cover ? { cover } : {}) });
                  setBusy(false);
                }}
              >
                Enregistrer l&apos;apparence
              </Btn>
              {changed && <Btn kind="ghost" onClick={() => setS(saved)}>Annuler les changements</Btn>}
              {!changed && <span className="text-xs text-slate-500">Vos clients voient cette apparence.</span>}
            </div>
          )}
        </div>

        <div className="order-first lg:order-last lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Aperçu en direct</p>
          <Preview key={replay} style={s} appPrimary={appPrimary} name={appName} logo={o.logo} items={items} />
        </div>
      </div>
    </Card>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-slate-800">{label}</legend>
      {children}
    </fieldset>
  );
}

function Choices<K extends string>({ value, options, onChange, disabled, icon, fontOf }: { value: K; options: Record<K, string>; onChange: (k: K) => void; disabled?: boolean; icon?: (k: K) => React.ReactNode; fontOf?: (k: K) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(options) as K[]).map((k) => (
        <button key={k} type="button" disabled={disabled} onClick={() => onChange(k)} aria-pressed={value === k} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition ${value === k ? "border-blue-600 bg-blue-50 font-semibold text-blue-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`} style={fontOf ? { fontFamily: fontOf(k) } : undefined}>
          {icon?.(k)}
          {options[k]}
        </button>
      ))}
    </div>
  );
}

/** Mini téléphone : mêmes couleurs, police, coins, disposition et animation que le menu public. */
function Preview({ style, appPrimary, name, logo, items }: { style: MenuStyle; appPrimary?: string; name: string; logo: string | null; items: Doc<OnlineItem>[] }) {
  const t = menuTokens(style, appPrimary);
  const bg = { background: t.accent, color: t.vars["--m-on-accent"] };
  const sample: { id: string; name: string; price: number; photo: string | null; category: string; description: string }[] = items.length
    ? items.map((m) => ({ id: m.id, name: m.data.name, price: m.data.price, photo: m.data.photo ?? null, category: m.data.category, description: m.data.description ?? "" }))
    : [
        { id: "a", name: "Poulet braisé", price: 4000, photo: null, category: "plat", description: "Exemple de plat" },
        { id: "b", name: "Poisson grillé", price: 5000, photo: null, category: "plat", description: "Exemple de plat" },
        { id: "c", name: "Jus de bissap", price: 1000, photo: null, category: "boisson", description: "Exemple de boisson" },
      ];
  const anim = style.animation;
  const wrap = (i: number, node: React.ReactNode) => (anim === "aucune" ? <li key={i}>{node}</li> : <li key={i} data-a={anim} className="m-reveal is-in" style={{ animationDelay: `${i * 90 + 120}ms` }}>{node}</li>);
  const photo = (p: string | null, cls: string) =>
    p ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={p} alt="" className={`object-cover ${cls}`} />
    ) : (
      <span className={`m-soft m-muted grid place-items-center ${cls}`}><Utensils className="h-4 w-4" aria-hidden /></span>
    );
  return (
    <div className="mx-auto w-[280px] overflow-hidden rounded-[2rem] border-[6px] border-slate-900 shadow-xl">
      <div className="m-root h-[500px] overflow-y-auto text-[13px]" style={t.vars as React.CSSProperties}>
        {style.cover ? (
          <div className="relative h-28">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={style.cover} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-2.5 text-white">
              <Logo logo={logo} bg={bg} />
              <b className="truncate text-base">{name}</b>
            </div>
          </div>
        ) : (
          <div className="m-surface flex items-center gap-2 p-3 shadow-sm">
            <Logo logo={logo} bg={bg} />
            <b className="truncate text-base">{name}</b>
          </div>
        )}
        <div className="m-surface flex gap-1 border-b m-border px-2 py-1.5">
          <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={bg}>{MENU_CATEGORY_LABELS[(sample[0]?.category ?? "plat") as keyof typeof MENU_CATEGORY_LABELS] ?? "Plats"}</span>
          <span className="m-soft rounded-full px-2.5 py-1 text-[11px]">Boissons</span>
        </div>
        <ul className={`p-2 ${style.layout === "grille" ? "grid grid-cols-2 gap-2" : "space-y-2"}`}>
          {sample.map((i, n) =>
            wrap(
              n,
              style.layout === "grille" ? (
                <div className="m-surface m-rad overflow-hidden border m-border">
                  {photo(i.photo, "aspect-square w-full")}
                  <div className="p-1.5"><p className="truncate font-semibold">{i.name}</p><p className="font-bold" style={{ color: t.accent }}>{fmtMoney(i.price)}</p></div>
                </div>
              ) : style.layout === "cartes" ? (
                <div className="m-surface m-rad overflow-hidden border m-border">
                  {photo(i.photo, "aspect-[16/10] w-full")}
                  <div className="flex items-center gap-2 p-2"><div className="min-w-0 flex-1"><p className="truncate font-semibold">{i.name}</p><p className="font-bold" style={{ color: t.accent }}>{fmtMoney(i.price)}</p></div><span className="grid h-7 w-7 place-items-center rounded-full" style={bg}><Plus className="h-4 w-4" aria-hidden /></span></div>
                </div>
              ) : (
                <div className="m-surface m-rad flex items-center gap-2 border m-border p-1.5">
                  <span className="m-rad-sm block h-12 w-12 shrink-0 overflow-hidden">{photo(i.photo, "h-full w-full")}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{i.name}</p><p className="truncate text-[11px] m-muted">{i.description}</p><p className="font-bold" style={{ color: t.accent }}>{fmtMoney(i.price)}</p></div>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={bg}><Plus className="h-4 w-4" aria-hidden /></span>
                </div>
              ),
            ),
          )}
        </ul>
        <div className="sticky bottom-0 p-2"><div className="m-rad flex items-center justify-between px-3 py-2 text-xs font-semibold shadow-lg" style={bg}><span>Voir le panier</span><span>{fmtMoney(sample[0]?.price ?? 0)}</span></div></div>
      </div>
    </div>
  );
}

function Logo({ logo, bg }: { logo: string | null; bg: React.CSSProperties }) {
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" className="m-rad-sm h-9 w-9 object-cover" />
  ) : (
    <span className="m-rad-sm grid h-9 w-9 place-items-center" style={bg}><Utensils className="h-4 w-4" aria-hidden /></span>
  );
}
