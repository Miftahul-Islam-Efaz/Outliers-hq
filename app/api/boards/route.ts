import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { currentUser } from "@/lib/auth"

/** Starter cards dropped onto every brand new board, Milanote style. */
function starterItems(boardId: string, userId: string) {
  return [
    {
      board_id: boardId,
      created_by: userId,
      kind: "card",
      shape: "rect",
      style: { fill: "#FFF6E5" },
      title: "Start here \u2728",
      body:
        "This is a card. Click it once to write inside.\n\nDrag it anywhere, or grab its corner to resize.",
      x: 220,
      y: 180,
      width: 260,
      height: 170,
      z: 1,
    },
    {
      board_id: boardId,
      created_by: userId,
      kind: "card",
      shape: "rect",
      style: { fill: "#E8F1FB" },
      title: "Connect your thinking",
      body:
        "Hover a card and press Connect (or right-click \u2192 Connect) to draw a line between two cards \u2014 just like this one.",
      x: 560,
      y: 180,
      width: 260,
      height: 170,
      z: 2,
    },
    {
      board_id: boardId,
      created_by: userId,
      kind: "card",
      shape: "rect",
      style: { fill: "#EAF6EE" },
      title: "Links, images & shapes",
      body:
        "Use Link in the dock to paste a YouTube/Instagram/Facebook URL and get a thumbnail.\n\nPaste an image with Ctrl+V. Add sticky notes, text and shapes from the dock. Scroll to zoom, right-click a card to recolour it.",
      x: 390,
      y: 420,
      width: 300,
      height: 200,
      z: 3,
    },
  ]
}

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const title = String(body?.title || "").trim() || "Untitled board"
  const description = String(body?.description || "").trim()

  const { data, error } = await db
    .from("whiteboards")
    .insert({ title, description, created_by: user.id })
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Seed the welcome cards + one example connector so the canvas is never empty.
  const { data: seeded } = await db
    .from("whiteboard_items")
    .insert(starterItems(data.id, user.id))
    .select("id")

  if (seeded && seeded.length >= 2) {
    await db.from("whiteboard_edges").insert({
      board_id: data.id,
      created_by: user.id,
      from_item: seeded[0].id,
      to_item: seeded[1].id,
    })
  }

  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id || "")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === "string") patch.title = body.title.trim() || "Untitled board"
  if (typeof body.description === "string") patch.description = body.description

  const { error } = await db.from("whiteboards").update(patch).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const id = new URL(req.url).searchParams.get("id") || ""
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const { data, error } = await db
    .from("whiteboards")
    .delete()
    .eq("id", id)
    .eq("created_by", user.id)
    .select("id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Only the creator can delete this board" }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
