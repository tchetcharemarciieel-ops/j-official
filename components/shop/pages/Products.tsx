"use client";

import { Archive, ArchiveRestore, Download, ImagePlus, Package, Pencil, Plus, Tags, Trash2, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { shrinkImage } from "@/components/runtime/venue/image";
import { readTabular } from "@/lib/file-read";
import { STOCK_STATE_LABELS, SHOP_TYPES, VARIANT_ATTRS, availableOf, hasVariants, stockState, totalStock, variantLabel, type Category, type Doc, type Product, type Supplier } from "@/lib/shop/model";
import { useCtx } from "../context";
import { Badge, Card, Empty, Field, Modal, Pager, SearchBox, downloadText, fcfa, paginate, qtyFmt, toCsv } from "../ui";

type Sort = "name" | "stock" | "price";

export function Products() {
  const c = useCtx();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [state, setState] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Doc<Product> | "new" | null>(null);
  const [cats, setCats] = useState(false);
  const [importing, setImporting] = useState(false);
  const canEdit = c.may("stock");
  const categories = (c.data.category as Doc<Category>[]).slice().sort((a, b) => a.data.sort - b.data.sort);
  const catName = (id: string | null) => categories.find((k) => k.id === id)?.data.name ?? "";

  const rows = useMemo(() => {
    const all = (c.data.product as Doc<Product>[]).filter((p) => p.data.archived === archived);
    const n = q.trim().toLowerCase();
    return all
      .filter((p) => !n || [p.data.name, p.data.sku, p.data.barcode, ...p.data.variants.flatMap((v) => [v.sku, v.barcode, variantLabel(v)])].some((x) => x?.toLowerCase().includes(n)))
      .filter((p) => !cat || p.data.category_id === cat)
      .filter((p) => !state || stockState(p.data) === state)
      .sort((a, b) => (sort === "stock" ? totalStock(a.data) - totalStock(b.data) : sort === "price" ? b.data.sell_price - a.data.sell_price : a.data.name.localeCompare(b.data.name, "fr")));
  }, [c.data.product, q, cat, state, sort, archived]);
  const pg = paginate(rows, page, 24);

  const exportCsv = () => {
    const head = ["nom", "categorie", "prix_vente", ...(c.s.can.cost ? ["prix_achat"] : []), "stock", "unite", "reference", "code_barres", "stock_minimum", "variante", "description"];
    const out: (string | number)[][] = [head];
    for (const p of c.data.product as Doc<Product>[]) {
      const base = (vLabel: string, price: number, buy: number, stock: number, sku: string, code: string) => [p.data.name, catName(p.data.category_id), price, ...(c.s.can.cost ? [buy] : []), stock, p.data.unit, sku, code, p.data.min_qty, vLabel, p.data.description];
      if (hasVariants(p.data)) for (const v of p.data.variants) out.push(base(variantLabel(v), v.price ?? p.data.sell_price, v.buy_price ?? p.data.buy_price, v.stock, v.sku, v.barcode));
      else out.push(base("", p.data.sell_price, p.data.buy_price, p.data.stock, p.data.sku, p.data.barcode));
    }
    downloadText(`produits-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(out));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Nom, référence ou code-barres…" /></div>
        <select className="input !w-auto" value={cat} onChange={(e) => (setCat(e.target.value), setPage(1))} aria-label="Catégorie">
          <option value="">Toutes les catégories</option>
          {categories.map((k) => <option key={k.id} value={k.id}>{k.data.name}</option>)}
        </select>
        <select className="input !w-auto" value={state} onChange={(e) => (setState(e.target.value), setPage(1))} aria-label="État du stock">
          <option value="">Tout le stock</option>
          <option value="rupture">Rupture</option>
          <option value="faible">Presque épuisé</option>
          <option value="ok">En stock</option>
        </select>
        <select className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Trier">
          <option value="name">Trier : nom</option>
          <option value="stock">Trier : stock</option>
          <option value="price">Trier : prix</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {canEdit && <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Ajouter un produit</button>}
        {canEdit && <button className="btn btn-ghost" onClick={() => setCats(true)}><Tags className="h-4 w-4" /> Catégories</button>}
        {canEdit && <button className="btn btn-ghost" onClick={() => setImporting(true)}><Upload className="h-4 w-4" /> Importer</button>}
        <button className="btn btn-ghost" onClick={exportCsv} disabled={!c.data.product.length}><Download className="h-4 w-4" /> Exporter (Excel/CSV)</button>
        <button className="btn btn-ghost" onClick={() => (setArchived(!archived), setPage(1))}>{archived ? "Voir le catalogue" : "Produits archivés"}</button>
      </div>

      {rows.length === 0 ? (
        <Empty icon={Package} title={archived ? "Aucun produit archivé" : q || cat || state ? "Aucun produit trouvé" : "Aucun produit pour le moment"} text={!archived && !q ? "Ajoutez votre premier produit, ou importez votre liste depuis un fichier Excel ou CSV." : undefined} action={canEdit && !archived && !q ? <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Ajouter un produit</button> : undefined} />
      ) : (
        <>
          <p className="text-xs text-slate-500">{rows.length} produit(s)</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pg.rows.map((p) => {
              const st = stockState(p.data);
              const photo = c.img(p.data.photo_ids[0]);
              return (
                <button key={p.id} onClick={() => setEdit(p)} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow">
                  <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {photo ? <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Package className="h-6 w-6 text-slate-400" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.data.name}</span>
                    <span className="block truncate text-xs text-slate-500">{[catName(p.data.category_id), p.data.sku, hasVariants(p.data) ? `${p.data.variants.length} variante(s)` : ""].filter(Boolean).join(" · ") || SHOP_TYPES[c.settings.type].label}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold">{fcfa(p.data.sell_price)}</span>
                      <Badge tone={st === "rupture" ? "red" : st === "faible" ? "amber" : "green"}>{st === "ok" ? `${qtyFmt(totalStock(p.data))} ${p.data.unit}` : STOCK_STATE_LABELS[st]}</Badge>
                      {!p.data.active && <Badge>Indisponible</Badge>}
                      {p.data.online && p.data.active && <Badge tone="blue">En ligne</Badge>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
        </>
      )}
      {edit && <ProductForm product={edit === "new" ? null : edit} onClose={() => setEdit(null)} readOnly={!canEdit} />}
      {cats && <CategoriesModal onClose={() => setCats(false)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  );
}

type VRow = { id?: string; values: Record<string, string>; sku: string; barcode: string; price: string; buy_price: string; active: boolean; initial: string; stock?: number };

function ProductForm({ product, onClose, readOnly }: { product: Doc<Product> | null; onClose: () => void; readOnly: boolean }) {
  const c = useCtx();
  const p = product?.data;
  const [f, setF] = useState({
    name: p?.name ?? "",
    description: p?.description ?? "",
    category_id: p?.category_id ?? "",
    buy_price: String(p?.buy_price ?? ""),
    sell_price: String(p?.sell_price ?? ""),
    unit: p?.unit ?? c.settings.units[0] ?? "pièce",
    min_qty: String(p?.min_qty ?? c.settings.low_stock_default),
    sku: p?.sku ?? "",
    barcode: p?.barcode ?? "",
    supplier_id: p?.supplier_id ?? "",
    active: p?.active ?? true,
    online: p?.online ?? true,
    track_expiry: p?.track_expiry ?? false,
    initial_stock: "",
    lot: "",
    expiry: "",
  });
  const [photos, setPhotos] = useState<string[]>(p?.photo_ids ?? []);
  const [attrs, setAttrs] = useState<string[]>(p?.variant_attrs.length ? p.variant_attrs : []);
  const [vars, setVars] = useState<VRow[]>((p?.variants ?? []).map((v) => ({ id: v.id, values: v.values, sku: v.sku, barcode: v.barcode, price: v.price === null ? "" : String(v.price), buy_price: v.buy_price === null ? "" : String(v.buy_price), active: v.active, initial: "", stock: v.stock })));
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const suppliers = c.data.supplier as Doc<Supplier>[];

  const addPhoto = async (file: File) => {
    try {
      setBusy(true);
      const data = await shrinkImage(file, 900, "image/jpeg", 380_000);
      const r = await c.run("photo.add", { data, kind: "product" }, { quiet: true });
      if (r?.id) setPhotos((x) => [...x, r.id!].slice(0, 6));
    } catch (e) {
      c.notify("error", e instanceof Error ? e.message : "Photo refusée.");
    } finally {
      setBusy(false);
    }
  };
  const toggleAttr = (a: string) => setAttrs((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a].slice(0, 3)));
  const save = async () => {
    setBusy(true);
    const r = await c.run("product.save", {
      id: product?.id,
      ...f,
      category_id: f.category_id || null,
      supplier_id: f.supplier_id || null,
      buy_price: f.buy_price || 0,
      min_qty: f.min_qty || 0,
      photo_ids: photos,
      variant_attrs: vars.length ? attrs : [],
      variants: vars.map((v) => ({ id: v.id, values: v.values, sku: v.sku, barcode: v.barcode, price: v.price, buy_price: v.buy_price, active: v.active, initial: product ? undefined : v.initial || undefined })),
      initial_stock: product || vars.length ? undefined : f.initial_stock || undefined,
      initial_lot: f.track_expiry && (f.lot || f.expiry) ? { number: f.lot, expiry: f.expiry } : null,
    });
    setBusy(false);
    if (r) onClose();
  };
  const archive = async () => {
    if (!product) return;
    if (await c.run("product.archive", { id: product.id, archived: !product.data.archived })) onClose();
  };
  const del = async () => {
    if (!product || !confirm(`Supprimer « ${product.data.name} » ? (Possible seulement s'il n'a jamais été vendu.)`)) return;
    if (await c.run("product.delete", { id: product.id })) onClose();
  };

  return (
    <Modal wide title={readOnly ? f.name : product ? "Modifier le produit" : "Nouveau produit"} onClose={onClose} footer={readOnly ? <button className="btn btn-ghost" onClick={onClose}>Fermer</button> : (
      <>
        {product && <button className="btn btn-ghost mr-auto" onClick={archive}>{product.data.archived ? <><ArchiveRestore className="h-4 w-4" /> Remettre au catalogue</> : <><Archive className="h-4 w-4" /> Archiver</>}</button>}
        {product && <button className="btn btn-danger" onClick={del}><Trash2 className="h-4 w-4" /> Supprimer</button>}
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !f.name || !f.sell_price}>{product ? "Enregistrer" : "Ajouter le produit"}</button>
      </>
    )}>
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {photos.map((id) => (
            <span key={id} className="relative h-20 w-20 overflow-hidden rounded-xl bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.img(id)!} alt="" className="h-full w-full object-cover" />
              {!readOnly && <button type="button" onClick={() => setPhotos((x) => x.filter((y) => y !== id))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 shadow" aria-label="Retirer la photo"><X className="h-3.5 w-3.5" /></button>}
            </span>
          ))}
          {!readOnly && photos.length < 6 && (
            <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-slate-400">
              <ImagePlus className="h-6 w-6" />
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void addPhoto(e.target.files[0])} />
            </label>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom du produit" className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={120} /></Field>
          <Field label="Prix de vente (FCFA)"><input className="input" inputMode="numeric" value={f.sell_price} onChange={(e) => set("sell_price", e.target.value.replace(/[^\d]/g, ""))} /></Field>
          {c.s.can.cost && <Field label="Prix d'achat (FCFA)" hint={f.sell_price && f.buy_price ? `Marge : ${fcfa(Number(f.sell_price) - Number(f.buy_price))} par ${f.unit}` : undefined}><input className="input" inputMode="numeric" value={f.buy_price} onChange={(e) => set("buy_price", e.target.value.replace(/[^\d]/g, ""))} /></Field>}
          <Field label="Catégorie">
            <select className="input" value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>
              <option value="">Sans catégorie</option>
              {(c.data.category as Doc<Category>[]).map((k) => <option key={k.id} value={k.id}>{k.data.name}</option>)}
            </select>
          </Field>
          <Field label="Unité">
            <select className="input" value={f.unit} onChange={(e) => set("unit", e.target.value)}>
              {c.settings.units.map((u) => <option key={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Référence"><input className="input" value={f.sku} onChange={(e) => set("sku", e.target.value)} maxLength={60} /></Field>
          <Field label="Code-barres" hint="Scannez-le avec un lecteur : il se remplit tout seul."><input className="input" value={f.barcode} onChange={(e) => set("barcode", e.target.value)} maxLength={60} /></Field>
          <Field label="Alerte de stock faible à partir de"><input className="input" inputMode="decimal" value={f.min_qty} onChange={(e) => set("min_qty", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
          {suppliers.length > 0 && (
            <Field label="Fournisseur habituel">
              <select className="input" value={f.supplier_id} onChange={(e) => set("supplier_id", e.target.value)}>
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.data.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Description" className="sm:col-span-2"><textarea className="input" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} /></Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Disponible à la vente</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.online} onChange={(e) => set("online", e.target.checked)} /> Visible dans la boutique en ligne</label>
          {!vars.length && <label className="flex items-center gap-2"><input type="checkbox" checked={f.track_expiry} onChange={(e) => set("track_expiry", e.target.checked)} /> Suivre les lots et dates de péremption</label>}
        </div>

        <Card title="Variantes" subtitle={`Tailles, couleurs, modèles… (conseillé : ${SHOP_TYPES[c.settings.type].attrs.join(", ")})`}>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...VARIANT_ATTRS, ...attrs])].map((a) => (
              <button type="button" key={a} onClick={() => toggleAttr(a)} className={`rounded-full border px-3 py-1 text-sm ${attrs.includes(a) ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-slate-300"}`}>{a}</button>
            ))}
          </div>
          {attrs.length > 0 && (
            <div className="mt-3 space-y-2">
              {vars.map((v, i) => (
                <div key={v.id ?? i} className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-6">
                  {attrs.map((a) => <input key={a} className="input" placeholder={a} value={v.values[a] ?? ""} onChange={(e) => setVars((x) => x.map((y, k) => (k === i ? { ...y, values: { ...y.values, [a]: e.target.value } } : y)))} aria-label={a} />)}
                  <input className="input" placeholder={`Prix (${f.sell_price || "idem"})`} inputMode="numeric" value={v.price} onChange={(e) => setVars((x) => x.map((y, k) => (k === i ? { ...y, price: e.target.value.replace(/[^\d]/g, "") } : y)))} aria-label="Prix de la variante" />
                  <input className="input" placeholder="Code-barres" value={v.barcode} onChange={(e) => setVars((x) => x.map((y, k) => (k === i ? { ...y, barcode: e.target.value } : y)))} aria-label="Code-barres de la variante" />
                  {product ? <span className="self-center text-xs text-slate-600">Stock : {qtyFmt(v.stock ?? 0)}</span> : <input className="input" placeholder="Stock initial" inputMode="decimal" value={v.initial} onChange={(e) => setVars((x) => x.map((y, k) => (k === i ? { ...y, initial: e.target.value.replace(/[^\d.]/g, "") } : y)))} aria-label="Stock initial" />}
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={v.active} onChange={(e) => setVars((x) => x.map((y, k) => (k === i ? { ...y, active: e.target.checked } : y)))} /> Active</label>
                    {!readOnly && <button type="button" onClick={() => setVars((x) => x.filter((_, k) => k !== i))} className="ml-auto text-slate-400 hover:text-red-600" aria-label="Retirer la variante"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </div>
              ))}
              {!readOnly && <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => setVars((x) => [...x, { values: {}, sku: "", barcode: "", price: "", buy_price: "", active: true, initial: "" }])}><Plus className="h-4 w-4" /> Ajouter une variante</button>}
            </div>
          )}
        </Card>

        {!product && !vars.length && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={`Stock initial (${f.unit})`}><input className="input" inputMode="decimal" value={f.initial_stock} onChange={(e) => set("initial_stock", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            {f.track_expiry && <Field label="Numéro de lot"><input className="input" value={f.lot} onChange={(e) => set("lot", e.target.value)} /></Field>}
            {f.track_expiry && <Field label="Date de péremption"><input className="input" type="date" value={f.expiry} onChange={(e) => set("expiry", e.target.value)} /></Field>}
          </div>
        )}
        {product && (
          <p className="text-xs text-slate-500">
            Stock actuel : {qtyFmt(totalStock(product.data))} {product.data.unit} (vendable : {qtyFmt(hasVariants(product.data) ? product.data.variants.reduce((a, v) => a + Math.max(0, availableOf(product.data, v.id)), 0) : Math.max(0, availableOf(product.data, null)))}). Le stock se modifie dans « Stock » (entrées, sorties, inventaire) pour garder l'historique.
            {product.data.lots.length > 0 && ` Lots : ${product.data.lots.map((l) => `${l.number} (${qtyFmt(l.qty)}${l.expiry ? `, ${l.expiry}` : ""})`).join(", ")}.`}
          </p>
        )}
      </fieldset>
    </Modal>
  );
}

function CategoriesModal({ onClose }: { onClose: () => void }) {
  const c = useCtx();
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const cats = (c.data.category as Doc<Category>[]).slice().sort((a, b) => a.data.sort - b.data.sort);
  const count = (id: string) => (c.data.product as Doc<Product>[]).filter((p) => p.data.category_id === id && !p.data.archived).length;
  return (
    <Modal title="Catégories" onClose={onClose}>
      <form className="flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        if (await c.run("category.save", { name })) setName("");
      }}>
        <input className="input" placeholder="Nouvelle catégorie (ex. Robes)" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <button className="btn btn-primary" disabled={!name.trim()}>Ajouter</button>
      </form>
      <ul className="mt-4 divide-y divide-slate-100">
        {cats.map((k) => (
          <li key={k.id} className="flex items-center gap-2 py-2">
            {edit?.id === k.id ? (
              <form className="flex flex-1 gap-2" onSubmit={async (e) => {
                e.preventDefault();
                if (await c.run("category.save", { id: k.id, name: edit.name, sort: k.data.sort })) setEdit(null);
              }}>
                <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
                <button className="btn btn-primary !px-3">OK</button>
              </form>
            ) : (
              <>
                <span className="flex-1">{k.data.name} <span className="text-xs text-slate-500">({count(k.id)})</span></span>
                <button className="p-2 text-slate-500 hover:text-slate-900" onClick={() => setEdit({ id: k.id, name: k.data.name })} aria-label="Renommer"><Pencil className="h-4 w-4" /></button>
                <button className="p-2 text-slate-500 hover:text-red-600" onClick={() => confirm(`Supprimer « ${k.data.name} » ? Ses produits resteront, sans catégorie.`) && void c.run("category.delete", { id: k.id })} aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </li>
        ))}
        {!cats.length && <li className="py-4 text-sm text-slate-500">Aucune catégorie.</li>}
      </ul>
    </Modal>
  );
}

const COLS: [string, string][] = [["name", "nom"], ["category", "categorie"], ["sell_price", "prix_vente"], ["buy_price", "prix_achat"], ["stock", "stock"], ["unit", "unite"], ["sku", "reference"], ["barcode", "code_barres"], ["min_qty", "stock_minimum"], ["description", "description"]];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

function ImportModal({ onClose }: { onClose: () => void }) {
  const c = useCtx();
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [res, setRes] = useState<{ created: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const read = async (file: File) => {
    try {
      const t = await readTabular(file);
      const map = t.header.map((h) => COLS.find(([, fr]) => norm(fr) === norm(h) || norm(h).startsWith(norm(fr)))?.[0] ?? null);
      if (!map.includes("name") || !map.includes("sell_price")) throw new Error("Colonnes « nom » et « prix_vente » introuvables. Téléchargez le modèle.");
      setRows(t.rows.map((r) => Object.fromEntries(map.map((k, i) => [k, (r[i] ?? "").trim()]).filter(([k]) => k)) as Record<string, string>).filter((r) => r.name));
    } catch (e) {
      c.notify("error", e instanceof Error ? e.message : "Fichier illisible.");
    }
  };
  const send = async () => {
    if (!rows) return;
    setBusy(true);
    const clean = rows.map((r) => ({ ...r, sell_price: (r.sell_price ?? "").replace(/[^\d]/g, ""), buy_price: (r.buy_price ?? "").replace(/[^\d]/g, "") || undefined, stock: (r.stock ?? "").replace(",", ".").replace(/[^\d.]/g, "") || undefined, min_qty: (r.min_qty ?? "").replace(/[^\d.]/g, "") || undefined }));
    const r = await c.run("product.import", { rows: clean });
    setBusy(false);
    if (r) setRes(r.data as { created: number; errors: string[] });
  };
  return (
    <Modal title="Importer des produits" onClose={onClose} footer={res ? <button className="btn btn-primary" onClick={onClose}>Terminer</button> : <><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!rows?.length || busy} onClick={send}>Importer {rows?.length ?? 0} produit(s)</button></>}>
      {res ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">{res.created} produit(s) ajouté(s).</p>
          {res.errors.length > 0 && <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-slate-600">{res.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">Fichier Excel (.xlsx) ou CSV, une ligne par produit. Colonnes reconnues : {COLS.map(([, f]) => f).join(", ")}.</p>
          <button className="btn btn-ghost !py-1.5" onClick={() => downloadText("modele-produits.csv", toCsv([COLS.map(([, f]) => f), ["Robe pagne", "Robes", 15000, 9000, 5, c.settings.units[0] ?? "pièce", "RP-001", "", 2, "Wax 100 % coton"]]))}><Download className="h-4 w-4" /> Télécharger le modèle</button>
          <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
          {rows && <p className="text-slate-700">{rows.length} ligne(s) prête(s). Les produits déjà présents (même nom, référence ou code-barres) seront ignorés.</p>}
        </div>
      )}
    </Modal>
  );
}
