import { db } from "./db"

/**
 * Settings live in the Supabase `app_settings` table so they can be edited in
 * the Supabase dashboard without a redeploy.
 *
 * The table itself is locked down (RLS on, no policies), because it holds the
 * Mistral API key and must never be readable through the public REST API.
 * Reads go through the `app_setting_get` accessor, which requires the
 * server-only shared secret from .env.local. Values are cached in memory for a
 * short window so a busy page does not hammer the database on every request.
 */
const TTL_MS = 60_000
const KEYS = ["mistral_api_key", "mistral_model"]

let cache: { at: number; values: Map<string, string> } | null = null
let inFlight: Promise<Map<string, string>> | null = null

function secret() {
  return process.env.AUTH_SECRET || ""
}

async function load(): Promise<Map<string, string>> {
  const values = new Map<string, string>()
  const results = await Promise.all(
    KEYS.map(async (key) => {
      const { data, error } = await db.rpc("app_setting_get", {
        p_key: key,
        p_secret: secret(),
      })
      if (error) return [key, null] as const
      return [key, (data as string | null) ?? null] as const
    }),
  )
  for (const [key, value] of results) {
    if (value && value.trim()) values.set(key, value.trim())
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
