import { currentUser } from "@/lib/auth"
import {
  join,
  leave,
  presenceOf,
  publish,
  setEditing,
  type LiveEvent,
} from "@/lib/live"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Events a browser is allowed to publish. Anything else is dropped.
const ALLOWED = new Set<LiveEvent["type"]>([
  "cursor",
  "editing",
  "item.upsert",
  "item.remove",
  "item.move",
  "edge.add",
  "edge.remove",
])

/** Opens the live stream for one board. */
export async function GET(req: Request) {
  const user = await currentUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const url = new URL(req.url)
  const boardId = url.searchParams.get("boardId") || ""
  const clientId = url.searchParams.get("clientId") || ""
  if (!boardId || !clientId) return new Response("Bad request", { status: 400 })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let open = true
      const write = (event: LiveEvent) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n"))
        } catch {
          open = false
        }
      }

      join({
        clientId,
        userId: user.id,
        boardId,
        send: write,
        editing: null,
        lastSeen: Date.now(),
      })

      write({
        type: "hello",
        boardId,
        senderId: user.id,
        clientId,
        payload: { presence: presenceOf(boardId) },
      })

      // Comment heartbeat keeps proxies from closing an idle stream.
      const beat = setInterval(() => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch {
          open = false
        }
      }, 25_000)

      const close = () => {
        if (!open) return
        open = false
        clearInterval(beat)
        leave(boardId, clientId)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      req.signal.addEventListener("abort", close)
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  })
}

/** Publishes one event to everyone else on the board. */
export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as
    | { boardId?: string; clientId?: string; type?: LiveEvent["type"]; payload?: unknown }
    | null

  const boardId = String(body?.boardId || "")
  const clientId = String(body?.clientId || "")
  const type = body?.type

  if (!boardId || !clientId || !type || !ALLOWED.has(type)) {
    return new Response("Bad request", { status: 400 })
  }

  if (type === "editing") {
    const itemId = (body?.payload as { itemId?: string } | null)?.itemId || null
    setEditing(boardId, clientId, itemId)
    return Response.json({ ok: true })
  }

  // senderId always comes from the session, never from the request body.
  publish({ type, boardId, senderId: user.id, clientId, payload: body?.payload }, clientId)
  return Response.json({ ok: true })
}
