/**
 * A tiny in-process pub/sub hub for live board collaboration.
 *
 * Everything here stays on the server: browsers talk to /api/live over an
 * EventSource guarded by the normal session cookie, so the Supabase keys are
 * never shipped to the client and no extra database traffic is created.
 * Cursors and "who is editing what" never touch the database at all.
 */
export type LiveEvent = {
  type:
    | "hello"
    | "presence"
    | "cursor"
    | "editing"
    | "item.upsert"
    | "item.remove"
    | "item.move"
    | "edge.add"
    | "edge.remove"
  boardId: string
  senderId: string
  clientId: string
  payload?: unknown
}

type Client = {
  clientId: string
  userId: string
  boardId: string
  send: (event: LiveEvent) => void
  editing: string | null
  lastSeen: number
}

type Board = Map<string, Client>

// Survives hot reloads in dev by hanging off globalThis.
const globalRef = globalThis as unknown as { __ohqLive?: Map<string, Board> }
const boards: Map<string, Board> = globalRef.__ohqLive || new Map()
globalRef.__ohqLive = boards

function boardOf(boardId: string): Board {
  let board = boards.get(boardId)
  if (!board) {
    board = new Map()
    boards.set(boardId, board)
  }
  return board
}

export function join(client: Client) {
  boardOf(client.boardId).set(client.clientId, client)
  broadcastPresence(client.boardId)
}

export function leave(boardId: string, clientId: string) {
  const board = boards.get(boardId)
  if (!board) return
  board.delete(clientId)
  if (board.size === 0) boards.delete(boardId)
  else broadcastPresence(boardId)
}

/** Who is on this board right now, and which card each person has open. */
export function presenceOf(boardId: string) {
  const board = boards.get(boardId)
  if (!board) return []
  const seen = new Map<string, { userId: string; editing: string | null }>()
  for (const client of board.values()) {
    const existing = seen.get(client.userId)
    seen.set(client.userId, {
      userId: client.userId,
      editing: client.editing || existing?.editing || null,
    })
  }
  return Array.from(seen.values())
}

export function broadcastPresence(boardId: string) {
  publish(
    {
      type: "presence",
      boardId,
      senderId: "server",
      clientId: "server",
      payload: presenceOf(boardId),
    },
    null,
  )
}

export function setEditing(boardId: string, clientId: string, itemId: string | null) {
  const client = boards.get(boardId)?.get(clientId)
  if (!client || client.editing === itemId) return
  client.editing = itemId
  broadcastPresence(boardId)
}

/** Fan out to everyone on the board, optionally skipping the sender. */
export function publish(event: LiveEvent, exceptClientId: string | null) {
  const board = boards.get(event.boardId)
  if (!board) return
  for (const client of board.values()) {
    if (exceptClientId && client.clientId === exceptClientId) continue
    try {
      client.send(event)
    } catch {
      board.delete(client.clientId)
    }
  }
}

export type { Client as LiveClient }
