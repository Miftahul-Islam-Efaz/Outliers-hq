import { NextResponse } from "next/server"
import { currentUser } from "@/lib/auth"
import { chat, MistralError } from "@/lib/mistral"
import { CATEGORIES } from "@/lib/links"

export const dynamic = "force-dynamic"

/**
 * Per-user throttle.
 *
 * This used to be stamped *before* the model call, so a failed attempt still
 * burned the window and the client's own retry immediately came back 429.
 * That is what made the button look broken: one click, two requests, and a
 * confusing "wait a couple of seconds" message. Now a run is only recorded
 * once it actually reaches Mistral, and an in-flight guard stops double
 * submissions instead of rate-limiting them.
 */
const lastRun = new Map<string, number>()
const inFlight = new Set<string>()
const USER_GAP_MS = 1500

const SYSTEM = [
  "You tidy up rough product ideas for a small team's idea board.",
  "Reply with JSON only, shaped exactly like:",
  '{"title": string, "description": string, "category": string, "tags": string[]}',
  "Rules:",
  "- title: a clear, specific headline, at most 70 characters, no trailing period.",
  "- description: the same idea rewritten cleanly in 1-3 short sentences. Keep every fact the author wrote. Never invent details.",
  "- category: one short label, ideally one of: " + CATEGORIES.join(", ") + ".",
  "- tags: 2 to 5 lowercase single-word tags, no # prefix.",
  "- Write in the same language the author used.",
].join("\n")

function parseReply(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json(
      { error: "Your session expired. Reload the page and sign in again." },
      { status: 401 },
    )
  }

  if (inFlight.has(user.id)) {
    return NextResponse.json(
      { error: "Still organising your last paste \u2014 hang on a second." },
      { status: 429 },
    )
  }

  const since = Date.now() - (lastRun.get(user.id) || 0)
  if (since < USER_GAP_MS) {
    return NextResponse.json(
      { error: "Give it a second before organising again." },
      { status: 429 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const idea = String((body as { text?: string })?.text || "").trim()
  const draftTitle = String((body as { title?: string })?.title || "").trim()

  if (idea.length < 12) {
    return NextResponse.json(
      { error: "Write a little more of the idea first, then organise it." },
      { status: 400 },
    )
  }

  inFlight.add(user.id)

  try {
    const reply = await chat(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            (draftTitle ? "Working title: " + draftTitle + "\n\n" : "") +
            "Idea:\n" +
            idea.slice(0, 4000),
        },
      ],
      { jsonObject: true, maxTokens: 500, temperature: 0.2 },
    )

    lastRun.set(user.id, Date.now())

    const parsed = parseReply(reply)
    if (!parsed) {
      return NextResponse.json({ error: "Could not read Mistral's answer" }, { status: 502 })
    }

    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((t) => String(t).trim().replace(/^#/, "").toLowerCase()).filter(Boolean).slice(0, 5)
      : []

    return NextResponse.json({
      ok: true,
      result: {
        title: String(parsed.title || draftTitle || "").trim().slice(0, 120),
        description: String(parsed.description || idea).trim().slice(0, 4000),
        category: String(parsed.category || "").trim().slice(0, 40),
        tags,
      },
    })
  } catch (err) {
    const status = err instanceof MistralError ? err.status : 502
    const message = err instanceof Error ? err.message : "Could not organise the idea"
    // Configuration problems (missing/blocked key) should not be retried by
    // the client, so mark them.
    return NextResponse.json({ error: message, fatal: status === 503 }, { status })
  } finally {
    inFlight.delete(user.id)
  }
}
