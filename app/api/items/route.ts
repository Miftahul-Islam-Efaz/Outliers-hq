import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { currentUser } from "@/lib/auth"
import { buildPreview } from "@/lib/links"

const KINDS = ["card", "sticky", "text", "link", "shape", "image"]
const SHAPES = ["rect", "round", "ellipse", "diamond", "triangle", "freehand", "none"]

function cleanStyle(input: unknown) {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const style: Record<string, unknown> = {}
  const hex = (v: unknown) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v)) ? String(v) : undefined)
  if (hex(source.fill)) style.fill = hex(source.fill)
  if (hex(source.stroke)) style.stroke = hex(source.stroke)
  if (hex(source.color)) style.color = hex(source.color)
  if (source.fontSize !== undefined) {
    style.fontSize = Math.min(96, Math.max(10, Number(source.fontSize) || 15))
  }
  if (source.fontWeight !== undefined) {
    style.fontWeight = Math.min(900, Math.max(300, Number(source.fontWeight) || 500))
  }
  if (["left", "center", "right"].includes(String(source.align))) style.align = source.align
  if (typeof source.path === "string") style.path = source.path.slice(0, 12000)
  return style
}

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const boardId = String(body?.boardId || "")
  if (!boardId) return NextResponse.json({ error: "Missing boardId" }, { status: 400 })

  const kind = KINDS.includes(body?.kind) ? body.kind : "card"
  const shape = SHAPES.includes(body?.shape) ? body.shape : kind === "shape" ? "rect" : "rect"
  const rawUrl = String(body?.linkUrl || "").trim()
  // Pasted images are already hosted by us, so skip link preview fetching.
  const preview = rawUrl && kind !== "image" ? await buildPreview(rawUrl) : null

  const { data, error } = await db
    .from("whiteboard_items")
    .insert({
      board_id: boardId,
      created_by: user.id,
      kind,
      shape,
      style: cleanStyle(body?.style),
      title: String(body?.title || "").slice(0, 200),
      body: String(body?.body || "").slice(0, 4000),
      link_url: preview?.url || rawUrl || null,
      link_thumbnail: kind === "image" ? rawUrl || null : preview?.thumbnail || null,
      x: Math.round(Number(body?.x) || 0),
      y: Math.round(Number(body?.y) || 0),
      width: Math.round(Number(body?.width) || (kind === "text" ? 260 : 240)),
      height: Math.round(Number(body?.height) || (kind === "text" ? 70 : 150)),
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

export async function PATCH(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id || "")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ["x", "y", "width", "height"]) {
    if (body[key] !== undefined) patch[key] = Math.round(Number(body[key]))
  }
  if (typeof body.title === "string") patch.title = body.title.slice(0, 200)
  if (typeof body.body === "string") patch.body = body.body.slice(0, 4000)
  if (SHAPES.includes(body.shape)) patch.shape = body.shape
  if (body.style !== undefined) patch.style = cleanStyle(body.style)

  const { error } = await db.from("whiteboard_items").update(patch).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const id = new URL(req.url).searchParams.get("id") || ""
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const { error } = await db.from("whiteboard_items").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
