"use client";

import { useState } from "react";
import { useCtx } from "./context";

export { Badge, Card, Empty, Field, Modal, Pager, SearchBox, Stat, Tabs, paginate, downloadText, toCsv, dateFmt, timeFmt } from "@/components/shop/ui";
export { Pick, MultiPick, DeleteButton, DualBars } from "@/components/bureau/ui";
import type { OrderStatus } from "@/lib/transport/model";

export const uid = () => crypto.randomUUID();
export const fmtDT = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const fmtD = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const STATUS_TONE: Record<OrderStatus, "slate" | "blue" | "green" | "amber" | "red" | "violet"> = { nouvelle: "violet", attente: "amber", affecte: "blue", recupere: "blue", en_cours: "blue", arrive: "blue", livre: "green", echec: "red", retour: "amber", annule: "slate" };
export const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
export const osmUrl = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
export const waUrl = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

/** Lit une photo, la réduit (1024 px, JPEG) pour rester sous la limite d'envoi, et renvoie son contenu base64. */
export async function compressImage(file: File): Promise<{ mime: "image/jpeg"; data: string } | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Image illisible")); i.src = url; });
    const k = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.75, 0.6, 0.45]) {
      const d = c.toDataURL("image/jpeg", q).split(",")[1]!;
      if (Math.floor((d.length * 3) / 4) < 360_000) return { mime: "image/jpeg", data: d };
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

/** Sélecteur de photo : envoie la photo au serveur et renvoie son identifiant. */
export function usePhoto() {
  const c = useCtx();
  const [busy, setBusy] = useState(false);
  const add = async (file: File | undefined): Promise<string | null> => {
    if (!file) return null;
    setBusy(true);
    try {
      const img = await compressImage(file);
      if (!img) { c.notify("error", "Photo illisible ou trop lourde."); return null; }
      const r = await c.run("photo.add", img, { quiet: true });
      return r?.id ?? null;
    } catch { c.notify("error", "Photo illisible."); return null; } finally { setBusy(false); }
  };
  return { add, busy };
}

/** Lit un fichier image pour le logo (taille limitée) en base64. */
export function readLogo(file: File): Promise<{ mime: "image/png" | "image/jpeg" | "image/webp"; data: string } | null> {
  return new Promise((res) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 280_000) return res(null);
    const r = new FileReader();
    r.onload = () => res({ mime: file.type as "image/png", data: String(r.result).split(",")[1] ?? "" });
    r.onerror = () => res(null);
    r.readAsDataURL(file);
  });
}
