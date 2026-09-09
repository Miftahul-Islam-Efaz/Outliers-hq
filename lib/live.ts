/**
 * A tiny in-process pub/sub hub for live board collaboration.
 *
 * Everything here stays on the server: browsers talk to /api/live over an
 * EventSource guarded by the normal session cookie, so the Supabase keys are
 * never shipped to the client and no extra database traffic is created.
 * Cursors and "who is editing what" never touch the database at all.
 *
 * Note: this hub is per server process. It works on a single long-lived Node
 * server (`next start`). On a serverless host that runs many isolated
 * instances, two people can land on different instances and never see each
 * other, which looks exactly like "the teammate's cursor disappeared".
 */
export type LiveEvent = {
  type:
    | "hello"
    | "presence"
    | "cursor"
    | "ping"
    | "cursors"
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
const globalRef = globalThis as unknown as {
  __ohqLive?: Map<string, Board>
  __ohqLiveSweep?: ReturnType<typeof setInterval>
}
const boards: Map<string, Board> = globalRef.__ohqLive || new Map()
globalRef.__ohqLive = boards

/** A client that has not pinged or published for this long is considered gone. */
const STALE_MS = 45_000

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

/** Marks a client as alive. Called on every publish and on client pings. */
export function touch(boardId: string, clientId: string) {
  const client = boards.get(boardId)?.get(clientId)
  if (client) client.lastSeen = Date.now()
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
  if (!client) return
  client.lastSeen = Date.now()
  if (client.editing === itemId) return
  client.editing = itemId
  broadcastPresence(boardId)
}

/** Fan out to everyone on the board, optionally skipping the sender. */
export function publish(event: LiveEvent, exceptClientId: string | null) {
  const board = boards.get(event.boardId)
  if (!board) return
  const dead: string[] = []
  for (const client of board.values()) {
    if (exceptClientId && client.clientId === exceptClientId) continue
    try {
      client.send(event)
    } catch {
      dead.push(client.clientId)
    }
  }
  for (const id of dead) board.delete(id)
  if (board.size === 0) boards.delete(event.boardId)
}

/**
 * Drops clients whose browser vanished without a clean disconnect (laptop
 * closed, tab suspended, proxy dropped the stream). Without this, presence
 * kept ghosts around and real teammates were hidden behind stale entries.
 */
function sweep() {
  const now = Date.now()
  for (const [boardId, board] of boards) {
    let changed = false
    for (const client of board.values()) {
      if (now - client.lastSeen > STALE_MS) {
        board.delete(client.clientId)
        changed = true
      }
    }
    if (board.size === 0) boards.delete(boardId)
    else if (changed) broadcastPresence(boardId)
  }
}

if (!globalRef.__ohqLiveSweep) {
  const timer = setInterval(sweep, 15_000)
  // Never hold the process open just for the sweeper.
  if (typeof timer.unref === "function") timer.unref()
  globalRef.__ohqLiveSweep = timer
}

export type { Client as LiveClient }
