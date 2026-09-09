import { db } from "./db"

/**
 * Settings live in the Supabase `app_settings` table so they can be edited in
 * the Supabase dashboard without a redeploy. Values are cached in memory for a
 * short window so a busy page does not hammer the database on every request.
 */
const TTL_MS = 60_000
let cache: { at: number; values: Map<string, string> } | null = null
let inFlight: Promise<Map<string, string>> | null = null

async function load(): Promise<Map<string, string>> {
  const { data } = await db.from("app_settings").select("key, value")
  const values = new Map<string, string>()
  for (const row of (data || []) as Array<{ key: string; value: string | null }>) {
    if (row.value) values.set(row.key, row.value.trim())
  }
  cache = { at: Date.now(), values }
  return values
}

export async function getSettings(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values
  // Collapse concurrent misses into a single database read.
  if (!inFlight) {
    inFlight = load().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

export async function getSetting(key: string, fallback = "") {
  return (await getSettings()).get(key) || fallback
}

export function clearSettingsCache() {
  cache = null
}
