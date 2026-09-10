import { db } from "./db"

/**
 * Settings live in the Supabase `app_settings` table so they can be edited in
 * the Supabase dashboard without a redeploy.
 *
 * The table is locked down (RLS on, no policies), so reads go through the
 * `app_setting_get` accessor, which requires the server-only shared secret.
 *
 * Two things used to go wrong here and both are handled now:
 *  - If AUTH_SECRET is missing or does not match `app_secrets.server_secret`
 *    (very easy on a fresh Vercel deploy, where .env.local is not uploaded),
 *    the RPC raises `forbidden` and we silently returned "no key". We now keep
 *    the reason so the UI can say what is actually wrong.
 *  - Environment variables now win over the database, so MISTRAL_API_KEY can
 *    be set directly on the host if you prefer.
 */
const TTL_MS = 60_000
const FAIL_TTL_MS = 5_000 // don't cache a failure for a whole minute
const KEYS = ["mistral_api_key", "mistral_model"] as const

const ENV_FALLBACK: Record<string, string | undefined> = {
  mistral_api_key: process.env.MISTRAL_API_KEY,
  mistral_model: process.env.MISTRAL_MODEL,
}

let cache: { at: number; values: Map<string, string>; error: string | null } | null = null
let inFlight: Promise<{ values: Map<string, string>; error: string | null }> | null = null

function secret() {
  // Pasting into a hosting dashboard often drags along whitespace, a newline
  // or wrapping quotes. Those are not a different secret, so normalise here
  // as well as in the Postgres accessor.
  return (process.env.AUTH_SECRET || "").trim().replace(/^["']|["']$/g, "")
}

async function load(): Promise<{ values: Map<string, string>; error: string | null }> {
  const values = new Map<string, string>()
  let error: string | null = null

  // Environment first — it never fails and makes local debugging trivial.
  for (const key of KEYS) {
    const fromEnv = ENV_FALLBACK[key]
    if (fromEnv && fromEnv.trim()) values.set(key, fromEnv.trim())
  }

  const missing = KEYS.filter((k) => !values.has(k))
  if (missing.length) {
    if (!secret()) {
      error =
        "AUTH_SECRET is not set on the server, so the Mistral key cannot be read out of Supabase."
    } else {
      const results = await Promise.all(
        missing.map(async (key) => {
          const { data, error: rpcError } = await db.rpc("app_setting_get", {
            p_key: key,
            p_secret: secret(),
          })
          if (rpcError) {
            return [key, null, rpcError.message || "settings lookup failed"] as const
          }
          return [key, (data as string | null) ?? null, null] as const
        }),
      )
      for (const [key, value, rpcError] of results) {
        if (value && value.trim()) values.set(key, value.trim())
        if (rpcError && !error) {
          error = /forbidden/i.test(rpcError)
            ? "Supabase refused the settings read: AUTH_SECRET does not match app_secrets.server_secret."
            : rpcError
        }
      }
    }
  }

  const failed = Boolean(error) || !values.get("mistral_api_key")
  cache = { at: failed ? Date.now() - (TTL_MS - FAIL_TTL_MS) : Date.now(), values, error }
  return { values, error }
}

async function read() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { values: cache.values, error: cache.error }
  }
  if (!inFlight) {
    inFlight = load().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

export async function getSettings(): Promise<Map<string, string>> {
  return (await read()).values
}

export async function getSetting(key: string, fallback = "") {
  return (await getSettings()).get(key) || fallback
}

/** Why the last settings read failed, if it did. Used for honest error text. */
export async function settingsError(): Promise<string | null> {
  return (await read()).error
}

export function clearSettingsCache() {
  cache = null
}
