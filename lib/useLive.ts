"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js"
import { apiFetch } from "@/lib/base"

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

/** Cursor moves are broadcast at most this often (ms). */
const CURSOR_GAP = 16
/** A cursor fades after this much silence from someone not in presence. */
const CURSOR_TTL = 15_000

/** One shared socket per tab, even if several boards mount. */
let clientPromise: Promise<SupabaseClient> | null = null

/** Why the last connection attempt failed, for the on-screen status. */
export type LiveStatus =
  | "connecting"
  | "online"
  | "config-failed"
  | "channel-error"
  | "timed-out"
  | "closed"

function getRealtimeClient(): Promise<SupabaseClient> {
  if (clientPromise) return clientPromise
  clientPromise = apiFetch("/api/realtime-config")
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error("realtime-config HTTP " + res.status + " " + body.slice(0, 120))
      }
      return res.json() as Promise<{ url?: string; key?: string }>
    })
    .then((cfg) => {
      if (!cfg?.url || !cfg?.key) throw new Error("realtime-config returned no url/key")
      return createClient(cfg.url, cfg.key, {
        auth: { persistSession: false, autoRefreshToken: false },
        // Cursors are chatty; cap the rate so a fast mouse cannot flood the
        // socket or burn through the free-tier message allowance.
        realtime: { params: { eventsPerSecond: 64 } },
      })
    })
    .catch((err) => {
      // Drop the cached promise so the next attempt can genuinely retry.
      clientPromise = null
      throw err
    })
  return clientPromise
}

/**
 * Connects the board to Supabase Realtime.
 *
 * This replaces the old in-process SSE hub. That hub held every connected
 * client in one server's memory, which works on a single long-lived Node
 * process but cannot work on serverless hosting: two people routed to
 * different instances never saw each other, and long streams were cut off
 * mid-flight. Supabase Realtime is a persistent service both browsers reach
 * directly.
 *
 * Broadcast messages are ephemeral - they never touch the database, so this
 * adds no rows, no reads and no storage. Presence handles join/leave, which
 * is what actually fixes teammates' cursors disappearing.
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
  /**
   * Cursor positions are held in a ref and read by an animation loop.
   * Putting them in state re-rendered the entire board on every incoming
   * packet, which is what made teammate cursors crawl.
   */
  const cursorsRef = useRef<Map<string, Cursor>>(new Map())
  /** Only who has a cursor - changes on join/leave, not on movement. */
  const [cursorIds, setCursorIds] = useState<string[]>([])
  const [online, setOnline] = useState(false)
  const [status, setStatus] = useState<LiveStatus>("connecting")
  const [detail, setDetail] = useState<string | null>(null)
  /** Bumped to force a fresh connection attempt. */
  const [attempt, setAttempt] = useState(0)
  const handler = useRef(onEvent)
  handler.current = onEvent

  const channelRef = useRef<RealtimeChannel | null>(null)
  const readyRef = useRef(false)
  /** Events raised before the socket finished connecting. */
  const queued = useRef<Array<{ type: LiveKind; payload?: unknown }>>([])
  const editingRef = useRef<string | null>(null)
  const pending = useRef<{ x: number; y: number } | null>(null)
  const frame = useRef<number | null>(null)
  const lastCursor = useRef(0)
  /** Grows while the channel keeps failing; reset once connected. */
  const backoffRef = useRef(0)
  const peersRef = useRef<Peer[]>([])
  peersRef.current = peers

  useEffect(() => {
    if (!boardId || !meId) return
    let cancelled = false
    let channel: RealtimeChannel | null = null
    let liveClient: SupabaseClient | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    setStatus("connecting")

    void getRealtimeClient().then((client) => {
      if (cancelled) return
      liveClient = client

      channel = client.channel("board:" + boardId, {
        config: {
          broadcast: { self: false },
          presence: { key: clientId },
        },
      })
      channelRef.current = channel

      // Presence is the source of truth for who is on the board.
      const syncPresence = () => {
        if (!channel) return
        const state = channel.presenceState<{ userId: string; editing: string | null }>()
        const seen = new Map<string, Peer>()
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (!entry?.userId) continue
            const existing = seen.get(entry.userId)
            // With two tabs open, whichever tab is editing wins.
            seen.set(entry.userId, {
              userId: entry.userId,
              editing: entry.editing ?? existing?.editing ?? null,
            })
          }
        }
        const next = [...seen.values()]
        setPeers((prev) => {
          const same =
            prev.length === next.length &&
            prev.every((p, i) => p.userId === next[i].userId && p.editing === next[i].editing)
          return same ? prev : next
        })

        // Deliberately NOT pruning cursors here. A cursor is only refreshed
        // when that person moves their mouse, so dropping it on a presence
        // blip hid idle teammates permanently. The sweep below expires them.
      }

      channel.on("presence", { event: "sync" }, syncPresence)
      channel.on("presence", { event: "join" }, syncPresence)
      channel.on("presence", { event: "leave" }, syncPresence)

      channel.on("broadcast", { event: "cursor" }, ({ payload }) => {
        const data = payload as {
          senderId?: string
          clientId?: string
          x?: number
          y?: number
        }
        if (!data || data.clientId === clientId) return
        if (typeof data.x !== "number" || typeof data.y !== "number") return
        const senderId = String(data.senderId || "")
        if (!senderId || senderId === meId) return
        const known = cursorsRef.current.has(senderId)
        cursorsRef.current.set(senderId, {
          userId: senderId,
          x: data.x as number,
          y: data.y as number,
          at: Date.now(),
        })
        // No setState on movement: the render loop picks the new value up.
        if (!known) setCursorIds([...cursorsRef.current.keys()])
      })

      // Everything else (item/edge changes, editing badges) is forwarded to
      // the board unchanged, so callers keep the same event shape as before.
      channel.on("broadcast", { event: "live" }, ({ payload }) => {
        const event = payload as Incoming
        if (!event || event.clientId === clientId) return
        if (event.type === "editing") {
          // Editing state rides on presence too, so just resync.
          syncPresence()
        }
        handler.current(event)
      })

      void channel.subscribe((state, err) => {
        if (cancelled) return
        const connected = state === "SUBSCRIBED"
        readyRef.current = connected
        setOnline(connected)
        // Always keep the raw state visible; guessing at causes cost us days.
        // eslint-disable-next-line no-console
        console.info("[live] channel " + state, err || "")
        if (connected) {
          setStatus("online")
          setDetail(null)
        } else if (state === "CHANNEL_ERROR") {
          setStatus("channel-error")
          setDetail(err?.message || "CHANNEL_ERROR")
        } else if (state === "TIMED_OUT") {
          setStatus("timed-out")
          setDetail("TIMED_OUT")
        } else if (state === "CLOSED") {
          setStatus("closed")
          setDetail("CLOSED")
        }

        // A dropped channel never recovers on its own, so schedule a rejoin.
        // The delay grows each time: a flat retry turned every reconnect into
        // another reconnect and the board blinked on and off indefinitely.
        if (connected) {
          backoffRef.current = 0
          if (retryTimer) {
            clearTimeout(retryTimer)
            retryTimer = null
          }
        } else if (!retryTimer) {
          const wait = Math.min(2000 * Math.pow(2, backoffRef.current), 30_000)
          backoffRef.current += 1
          retryTimer = setTimeout(() => {
            retryTimer = null
            if (!cancelled) setAttempt((n) => n + 1)
          }, wait)
        }

        if (connected && channel) {
          void channel.track({ userId: meId, editing: editingRef.current })
          const backlog = queued.current
          queued.current = []
          for (const entry of backlog) {
            void channel.send({
              type: "broadcast",
              event: "live",
              payload: { type: entry.type, senderId: meId, clientId, payload: entry.payload },
            })
          }
        }
      })
    })
    .catch((err: unknown) => {
      if (cancelled) return
      // This is the case that used to hang on "connecting" forever.
      setStatus("config-failed")
      setDetail(err instanceof Error ? err.message : String(err))
    })

    return () => {
      cancelled = true
      readyRef.current = false
      const active = channel
      channelRef.current = null
      setOnline(false)
      setPeers([])
      if (retryTimer) clearTimeout(retryTimer)
      if (active) {
        void active.untrack().catch(() => {})
        if (liveClient) {
          void liveClient.removeChannel(active).catch(() => {})
        } else {
          void active.unsubscribe().catch(() => {})
        }
      }
    }
  }, [boardId, meId, clientId, attempt])

  // Safety net: drop cursors from anyone who went quiet and is not in
  // presence. People who are connected but idle keep their cursor.
  useEffect(() => {
    const timer = setInterval(() => {
      const connected = new Set(peersRef.current.map((p) => p.userId))
      let changed = false
      for (const [id, cur] of cursorsRef.current) {
        const keep = connected.has(id) || Date.now() - cur.at < CURSOR_TTL
        if (!keep) {
          cursorsRef.current.delete(id)
          changed = true
        }
      }
      if (changed) setCursorIds([...cursorsRef.current.keys()])
    }, 3000)
    return () => clearInterval(timer)
  }, [])

  const send = useCallback(
    (type: LiveKind, payload?: unknown) => {
      const channel = channelRef.current
      if (!channel || !readyRef.current) {
        // Still connecting: hold the change instead of dropping it. Cursors
        // and heartbeats are worthless once stale, so they are not queued.
        if (type !== "cursor" && type !== "ping" && queued.current.length < 50) {
          queued.current.push({ type, payload })
        }
        return
      }

      // "editing" also updates presence so a late joiner sees the badge.
      if (type === "editing") {
        const itemId = (payload as { itemId?: string | null } | undefined)?.itemId ?? null
        // Bail if nothing changed. Re-tracking presence on every render sent a
        // continuous stream of presence updates, which tripped the rate limit
        // and made the channel drop and rejoin about once a second.
        if (editingRef.current === itemId) return
        editingRef.current = itemId
        void channel.track({ userId: meId, editing: itemId })
      }

      // Heartbeats are unnecessary now: presence is maintained by the socket.
      if (type === "ping") return

      void channel.send({
        type: "broadcast",
        event: "live",
        payload: { type, senderId: meId, clientId, payload },
      })
    },
    [meId, clientId],
  )

  const flushCursor = useCallback(() => {
    frame.current = null
    const point = pending.current
    if (!point) return
    const now = Date.now()
    if (now - lastCursor.current < CURSOR_GAP) {
      // Too soon: come back next frame with the newest position.
      frame.current = requestAnimationFrame(flushCursor)
      return
    }
    const channel = channelRef.current
    if (!channel || !readyRef.current) return
    pending.current = null
    lastCursor.current = now
    void channel.send({
      type: "broadcast",
      event: "cursor",
      payload: {
        senderId: meId,
        clientId,
        x: Math.round(point.x),
        y: Math.round(point.y),
      },
    })
  }, [meId, clientId])

  /**
   * Coalesced: pointermove fires far faster than the network can keep up, so
   * only the latest position is kept and shipped once per frame.
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
    (itemId: string) =>
      peers.find((p) => p.editing === itemId && p.userId !== meId)?.userId || null,
    [peers, meId],
  )

  /** Throw away the cached client and connect again from scratch. */
  const retry = useCallback(() => {
    clientPromise = null
    setAttempt((n) => n + 1)
  }, [])

  // A fresh object literal here re-triggered every caller effect that depends
  // on `live`, which is what drove the connect/disconnect cycle.
  return useMemo(
    () => ({
      peers,
      cursorIds,
      cursorsRef,
      online,
      status,
      detail,
      retry,
      send,
      sendCursor,
      editingBy,
      clientId,
    }),
    [peers, cursorIds, online, status, detail, retry, send, sendCursor, editingBy, clientId],
  )
}
