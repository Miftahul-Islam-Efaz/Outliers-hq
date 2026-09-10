import { NextResponse } from "next/server"
import { currentUser } from "@/lib/auth"
import { db } from "@/lib/db"

/**
 * Board chat. Messages are deliberately short-lived: anything older than 24h
 * is purged on every read, so the table can never grow into real storage.
 * Live delivery happens over the realtime broadcast channel - this route only
 * persists the last day so someone joining late still sees recent context.
 */
const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  const me = await currentUser()
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const boardId = new URL(req.url).searchParams.get("boardId")
  if (!boardId) return NextResponse.json({ error: "Missing boardId" }, { status: 400 })

  const cutoff = new Date(Date.now() - DAY_MS).toISOString()

  // Housekeeping first, so expired rows are never returned or kept around.
  await db.from("board_messages").delete().lt("created_at", cutoff)

  const { data, error } = await db
    .from("board_messages")
    .select("id, board_id, user_id, body, created_at")
    .eq("board_id", boardId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data || [] })
}

export async function POST(req: Request) {
  const me = await currentUser()
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const payload = (await req.json().catch(() => ({}))) as {
    boardId?: string
    body?: string
  }
  const boardId = payload.boardId
  const body = (payload.body || "").trim()

  if (!boardId) return NextResponse.json({ error: "Missing boardId" }, { status: 400 })
  if (!body) return NextResponse.json({ error: "Message is empty" }, { status: 400 })

  const { data, error } = await db
    .from("board_messages")
    .insert({ board_id: boardId, user_id: me.id, body: body.slice(0, 800) })
    .select("id, board_id, user_id, body, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: data })
}
