import "server-only";
import { adminClient } from "./supabase/admin";
import { serverConfigured } from "./config";
import { parseSetting, type Setting, type SettingKey } from "./settings-schema";

/** Lecture des paramètres de la plateforme, avec un cache court (30 s) par instance du serveur. */
const cache = new Map<string, { value: unknown; at: number }>();
const TTL = 30_000;

export async function getSetting<K extends SettingKey>(key: K): Promise<Setting<K>> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return parseSetting(key, hit.value);
  if (!serverConfigured()) return parseSetting(key, {});
  try {
    const { data } = await adminClient().from("platform_settings").select("value").eq("key", key).maybeSingle();
    cache.set(key, { value: data?.value ?? {}, at: Date.now() });
    return parseSetting(key, data?.value ?? {});
  } catch {
    return parseSetting(key, hit?.value ?? {});
  }
}

export async function setSetting<K extends SettingKey>(key: K, value: Setting<K>, adminId: string) {
  const { error } = await adminClient().from("platform_settings").upsert({ key, value, updated_at: new Date().toISOString(), updated_by: adminId }, { onConflict: "key" });
  if (error) throw new Error("Enregistrement impossible.");
  cache.set(key, { value, at: Date.now() });
}
