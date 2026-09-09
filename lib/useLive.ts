"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiFetch, withBase } from "@/lib/base"

export type LiveKind =
  | "cursor"
  | "editing"
  | "item.upsert"
  | "item.remove"
  | "item.move"
  | "edge.add"
  | "edge.remove"

export type Incoming = { type: string; senderId: string; clientId: string; payload?: unknown }

export type Peer = { userId: string; editing: string | null }

export type Cursor = { userId: string; x: number; y: number; at: number }

/** Cursor moves are streamed at most this often (ms). */
const CURSOR_GAP = 60
/** A cursor disappears after this much silence (ms). */
const CURSOR_TTL = 6000

/**
 * Connects the board to the live stream.
 *
 * `onEvent` receives everyone else's changes. Sending is fire-and-forget so a
 * slow network can never block the local interaction.
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
  const lastCursor = useRef(0)

  useEffect(() => {
    if (!boardId) return
    const url = withBase(
      "/api/live?boardId=" + encodeURIComponent(boardId) + "&clientId=" + clientId,
    )
    const source = new EventSource(url)

    source.onopen = () => setOnline(true)
    source.onerror = () => setOnline(false)
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
        setPeers((event.payload as Peer[]) || [])
        return
      }
      if (event.type === "cursor") {
        const point = event.payload as { x: number; y: number }
        setCursors((prev) => {
          const rest = prev.filter((c) => c.userId !== event.senderId)
          return [...rest, { userId: event.senderId, x: point.x, y: point.y, at: Date.now() }]
        })
        return
      }
      handler.current(event)
    }

    return () => {
      source.close()
      setOnline(false)
    }
  }, [boardId, clientId])

  // Drop cursors of people who went quiet or closed the tab.
  useEffect(() => {
    const timer = setInterval(() => {
      setCursors((prev) => {
        const fresh = prev.filter((c) => Date.now() - c.at < CURSOR_TTL)
        return fresh.length === prev.length ? prev : fresh
      })
    }, 2000)
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

  /** Throttled so a fast mouse cannot flood the stream. */
  const sendCursor = useCallback(
    (x: number, y: number) => {
      const now = Date.now()
      if (now - lastCursor.current < CURSOR_GAP) return
      lastCursor.current = now
      send("cursor", { x, y })
    },
    [send],
  )

  const editingBy = useCallback(
    (itemId: string) => peers.find((p) => p.editing === itemId && p.userId !== meId)?.userId || null,
    [peers, meId],
  )

  return { peers, cursors, online, send, sendCursor, editingBy, clientId }
}
