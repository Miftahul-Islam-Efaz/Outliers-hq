import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { currentUser } from "@/lib/auth"
import { buildPreview, CATEGORIES } from "@/lib/links"

function parseTags(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
  return String(input || "")
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 8)
}

// Categories are free text so the team can invent their own, with the built-in
// list only acting as suggestions.
function cleanCategory(input: unknown) {
  const value = String(input || "").trim().slice(0, 40)
  return value || CATEGORIES[0]
}

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 })

  const title = String(body.title || "").trim()
  const description = String(body.description || "").trim()
  const rawUrl = String(body.url || "").trim()

  // Title and description are the only required fields.
  if (!title) return NextResponse.json({ error: "Give the note a title" }, { status: 400 })
  if (!description) {
    return NextResponse.json({ error: "Add a description for the note" }, { status: 400 })
  }

  const preview = rawUrl ? await buildPreview(rawUrl) : null

  const { data, error } = await db
    .from("notes")
    .insert({
      author_id: user.id,
      title,
      description,
      category: cleanCategory(body.category),
      tags: parseTags(body.tags),
      link_url: preview?.url || (rawUrl || null),
      link_provider: preview?.provider || null,
      link_title: preview?.title || null,
      link_thumbnail: preview?.thumbnail || null,
      link_embed_url: preview?.embedUrl || null,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id, note: data })
}

export async function PATCH(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = String(body?.id || "")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim()
  if (typeof body.description === "string") patch.description = body.description
  if (body.category !== undefined) patch.category = cleanCategory(body.category)
  if (body.tags !== undefined) patch.tags = parseTags(body.tags)

  // author_id filter means only the author can change their own note.
  const { data, error } = await db
    .from("notes")
    .update(patch)
    .eq("id", id)
    .eq("author_id", user.id)
    .select("id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "You can only edit your own notes" }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const id = new URL(req.url).searchParams.get("id") || ""
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const { data, error } = await db
    .from("notes")
    .delete()
    .eq("id", id)
    .eq("author_id", user.id)
    .select("id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "You can only delete your own notes" }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
