import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Chiffrement des secrets enregistrés en base (clés API) : AES-256-GCM.
 * Clé : APP_ENCRYPTION_KEY (32 octets en base64) si elle est définie, sinon dérivée (HKDF-SHA256)
 * d'un secret déjà présent sur le serveur (clé de passerelle ou clé de service Supabase).
 * Si ce secret change, les clés enregistrées deviennent illisibles et doivent être ressaisies.
 */
function key(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    return k.length === 32 ? k : null;
  }
  const base = process.env.SUPABASE_GATEWAY_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || base.length < 20) return null;
  return Buffer.from(hkdfSync("sha256", base, "minisoft-rca", "platform-settings-api-keys-v1", 32));
}

export function encryptionAvailable(): boolean {
  return key() !== null;
}

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("APP_ENCRYPTION_KEY manquante.");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${data.toString("base64")}`;
}

export function decryptSecret(blob: string): string | null {
  const k = key();
  if (!k) return null;
  try {
    const [v, iv, tag, data] = blob.split(".");
    if (v !== "v1" || !iv || !tag || !data) return null;
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Affichage sûr d'une clé : jamais plus que les 4 derniers caractères. */
export function maskSecret(s: string | undefined | null): string {
  if (!s) return "";
  return `••••••••${s.slice(-4)}`;
}
