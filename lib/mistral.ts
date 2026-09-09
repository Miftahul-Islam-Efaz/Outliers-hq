import { getSetting, settingsError } from "./settings"

/**
 * A small, well-behaved Mistral client.
 *
 * Free-tier keys are limited per model by tokens-per-minute and
 * requests-per-second, so this module:
 *  - serialises calls through a queue (never more than one in flight),
 *  - spaces requests apart so we stay under the requests-per-second ceiling,
 *  - retries 429 and 5xx with exponential backoff, honouring `Retry-After`,
 *  - aborts anything that hangs, so a request can never wedge the app.
 */
const ENDPOINT = "https://api.mistral.ai/v1/chat/completions"
const DEFAULT_MODEL = "ministral-8b-2512"
const MIN_GAP_MS = 700 // ~1.4 req/s, comfortably under the 3.13 req/s limit
const TIMEOUT_MS = 20_000
const MAX_ATTEMPTS = 3

export class MistralError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

let chain: Promise<unknown> = Promise.resolve()
let lastCallAt = 0

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Runs jobs one at a time, with a minimum gap between them. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastCallAt)
    if (wait > 0) await sleep(wait)
    try {
      return await job()
    } finally {
      lastCallAt = Date.now()
    }
  })
  // Keep the chain alive even when a job rejects.
  chain = run.catch(() => undefined)
  return run as Promise<T>
}

async function callOnce(apiKey: string, body: unknown) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    return { status: res.status, text, retryAfter: res.headers.get("retry-after") }
  } finally {
    clearTimeout(timer)
  }
}

export async function chat(messages: Array<{ role: string; content: string }>, opts?: {
  maxTokens?: number
  temperature?: number
  jsonObject?: boolean
}) {
  const apiKey = await getSetting("mistral_api_key")
  if (!apiKey) {
    // Say exactly why. "No key" and "key is there but unreadable" are very
    // different problems and used to look identical from the browser.
    const why = await settingsError()
    throw new MistralError(
      why ||
        "No Mistral API key yet. Add one in Supabase under the app_settings table (key: mistral_api_key).",
      503,
    )
  }
  const model = await getSetting("mistral_model", DEFAULT_MODEL)

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts?.temperature ?? 0.2,
    max_tokens: opts?.maxTokens ?? 700,
  }
  if (opts?.jsonObject) body.response_format = { type: "json_object" }

  return enqueue(async () => {
    let lastMessage = "Mistral did not respond"
    let lastStatus = 502

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let result
      try {
        result = await callOnce(apiKey, body)
      } catch (err) {
        // Network error or timeout: worth one more try.
        lastMessage =
          (err as Error)?.name === "AbortError"
            ? "Mistral took too long to answer"
            : "Could not reach Mistral"
        lastStatus = 504
        if (attempt < MAX_ATTEMPTS) await sleep(500 * attempt * attempt)
        continue
      }

      const { status, text, retryAfter } = result

      if (status === 200) {
        const parsed = JSON.parse(text) as {
          choices?: Array<{ message?: { content?: string } }>
        }
        const content = parsed?.choices?.[0]?.message?.content
        if (!content) throw new MistralError("Mistral returned an empty answer", 502)
        return content
      }

      if (status === 401 || status === 403) {
        throw new MistralError(
          "Mistral rejected the API key. Check the mistral_api_key value in Supabase (it should be the full key, with no quotes or spaces).",
          502,
        )
      }

      if (status === 404 || status === 400) {
        // Almost always a bad model id in app_settings.mistral_model.
        let detail = ""
        try {
          detail = String((JSON.parse(text) as { message?: string })?.message || "")
        } catch {
          detail = ""
        }
        if (/model/i.test(detail) || status === 404) {
          throw new MistralError(
            'Mistral does not recognise the model "' +
              model +
              '". Fix mistral_model in Supabase (for example: mistral-small-latest).',
            502,
          )
        }
        throw new MistralError(detail || "Mistral rejected the request", 502)
      }

      if (status === 429 || status >= 500) {
        lastStatus = status === 429 ? 429 : 502
        lastMessage =
          status === 429
            ? "Mistral is rate limiting us right now. Try again in a moment."
            : "Mistral is having trouble right now. Try again in a moment."
        if (attempt < MAX_ATTEMPTS) {
          const hinted = Number(retryAfter) * 1000
          const backoff = Number.isFinite(hinted) && hinted > 0 ? hinted : 600 * attempt * attempt
          await sleep(Math.min(backoff, 6000))
          continue
        }
        break
      }

      // Any other 4xx is our fault and will not improve on retry.
      let detail = ""
      try {
        detail = String((JSON.parse(text) as { message?: string })?.message || "")
      } catch {
        detail = ""
      }
      throw new MistralError(detail || "Mistral rejected the request", 502)
    }

    throw new MistralError(lastMessage, lastStatus)
  })
}
