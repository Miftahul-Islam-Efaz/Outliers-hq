"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiFetch, withBase } from "@/lib/base"

export type LiveKind =
  | "cursor"
  | "editing"
  | "ping"
  | "item.upsert"
  | "item.remove"
  | "item.move"
  | "edge.add"
  | "edge.remove"

export type Incoming = { type: string; senderId: string; clientId: string; payload?: unknown }

export type Peer = { userId: string; editing: string | null }

export type Cursor = { userId: string; x: number; y: number; at: number }

/** Cursor moves are streamed at most this often (ms). */
const CURSOR_GAP = 50
/** A cursor disappears after this much silence (ms). */
const CURSOR_TTL = 15_000
/** Keep-alive so the server knows we are still here. */
const PING_MS = 15_000

/**
 * Connects the board to the live stream.
 *
 * `onEvent` receives everyone else's changes. Sending is fire-and-forget so a
 * slow network can never block the local interaction.
 *
 * Three things were making this feel slow and flaky:
 *  - every pointer move fired its own POST, so a fast mouse queued dozens of
 *    round trips; cursor moves are now coalesced and sent on an animation
 *    frame, keeping only the newest position,
 *  - the cursor TTL (6s) was shorter than a normal pause in mouse movement,
 *    so idle teammates vanished; the TTL is longer now and presence keeps
 *    connected people alive,
 *  - a dropped EventSource left the hook stuck "offline" with stale peers;
 *    it now reconnects with backoff and resyncs presence.
 */
export function useLive(
  boardId: string,
  meId: string,
  onEvent: (event: Incoming) => void,
) {
  const clientId = useMemo(
    () => Math.random().toString(36).slice(2) + Date.now().toString(36),
    [],
  )
  const [peers, setPeers] = useState<Peer[]>([])
  const [cursors, setCursors] = useState<Cursor[]>([])
  const [online, setOnline] = useState(false)
  const handler = useRef(onEvent)
  handler.current = onEvent

  // Coalesced cursor state.
  const pending = useRef<{ x: number; y: number } | null>(null)
  const frame = useRef<number | null>(null)
  const lastCursor = useRef(0)
  const peersRef = useRef<Peer[]>([])
  peersRef.current = peers

  useEffect(() => {
    if (!boardId) return
    let closed = false
    let source: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let attempts = 0

    const connect = () => {
      if (closed) return
      const url = withBase(
        "/api/live?boardId=" + encodeURIComponent(boardId) + "&clientId=" + clientId,
      )
      source = new EventSource(url)

      source.onopen = () => {
        attempts = 0
        setOnline(true)
      }

      source.onerror = () => {
        setOnline(false)
        // EventSource retries on its own, but a hard failure (proxy reset,
        // stream killed mid-flight) leaves it dead. Rebuild it ourselves.
        if (closed || !source || source.readyState !== EventSource.CLOSED) return
        source.close()
        source = null
        attempts += 1
        const wait = Math.min(1000 * 2 ** (attempts - 1), 10_000)
        retry = setTimeout(connect, wait)
      }

      source.onmessage = (raw) => {
        let event: Incoming
        try {
          event = JSON.parse(raw.data)
        } catch {
          return
        }
        if (event.clientId === clientId) return

        if (event.type === "hello") {
          setOnline(true)
          const payload = event.payload as { presence?: Peer[] } | undefined
          setPeers(payload?.presence || [])
          return
        }
        if (event.type === "presence") {
          const next = (event.payload as Peer[]) || []
          setPeers(next)
          // Someone who left the board should lose their cursor immediately.
          const here = new Set(next.map((p) => p.userId))
          setCursors((prev) => {
            const kept = prev.filter((c) => here.has(c.userId))
            return kept.length === prev.length ? prev : kept
          })
          return
        }
        if (event.type === "cursor") {
          const point = event.payload as { x: number; y: number }
          if (!point || typeof point.x !== "number") return
          setCursors((prev) => {
            const rest = prev.filter((c) => c.userId !== event.senderId)
            return [...rest, { userId: event.senderId, x: point.x, y: point.y, at: Date.now() }]
          })
          return
        }
        handler.current(event)
      }
    }

    connect()

    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      source?.close()
      setOnline(false)
    }
  }, [boardId, clientId])

  // Drop cursors of people who went quiet, but never drop someone who is
  // still listed in presence — they are connected, just not moving.
  useEffect(() => {
    const timer = setInterval(() => {
      setCursors((prev) => {
        const connected = new Set(peersRef.current.map((p) => p.userId))
        const fresh = prev.filter(
          (c) => connected.has(c.userId) || Date.now() - c.at < CURSOR_TTL,
        )
        return fresh.length === prev.length ? prev : fresh
      })
    }, 3000)
    return () => clearInterval(timer)
  }, [])

  const send = useCallback(
    (type: LiveKind, payload?: unknown) => {
      if (!boardId) return
      void apiFetch("/api/live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId, clientId, type, payload }),
        keepalive: true,
      }).catch(() => {})
    },
    [boardId, clientId],
  )

  // Heartbeat: tells the server this tab is alive so the stale sweeper does
  // not evict us and wipe our cursor for everyone else.
  useEffect(() => {
    if (!boardId) return
    const timer = setInterval(() => send("ping"), PING_MS)
    return () => clearInterval(timer)
  }, [boardId, send])

  const flushCursor = useCallback(() => {
    frame.current = null
    const point = pending.current
    if (!point) return
    const now = Date.now()
    if (now - lastCursor.current < CURSOR_GAP) {
      // Too soon: come back on the next frame with the newest position.
      frame.current = requestAnimationFrame(flushCursor)
      return
    }
    pending.current = null
    lastCursor.current = now
    send("cursor", { x: Math.round(point.x), y: Math.round(point.y) })
  }, [send])

  /**
   * Coalesced: pointermove fires far faster than the network can keep up, so
   * we keep only the latest position and ship it once per frame.
   */
  const sendCursor = useCallback(
    (x: number, y: number) => {
      pending.current = { x, y }
      if (frame.current == null) {
        frame.current = requestAnimationFrame(flushCursor)
      }
    },
    [flushCursor],
  )

  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const editingBy = useCallback(
    (itemId: string) => peers.find((p) => p.editing === itemId && p.userId !== meId)?.userId || null,
    [peers, meId],
  )

  return { peers, cursors, online, send, sendCursor, editingBy, clientId }
}
