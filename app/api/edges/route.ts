import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { currentUser } from "@/lib/auth"

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const boardId = String(body?.boardId || "")
  const fromItem = String(body?.fromItem || "")
  const toItem = String(body?.toItem || "")
  if (!boardId || !fromItem || !toItem || fromItem === toItem) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const { data, error } = await db
    .from("whiteboard_edges")
    .insert({ board_id: boardId, created_by: user.id, from_item: fromItem, to_item: toItem })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, edge: data })
}

export async function DELETE(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const id = new URL(req.url).searchParams.get("id") || ""
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const { error } = await db.from("whiteboard_edges").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
