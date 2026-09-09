import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { currentUser } from "@/lib/auth"

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const noteId = String(body?.noteId || "")
  const value = Number(body?.value)
  if (!noteId || (value !== 1 && value !== -1)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const { data: existing } = await db
    .from("note_reactions")
    .select("id, value")
    .eq("note_id", noteId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!existing) {
    const { error } = await db
      .from("note_reactions")
      .insert({ note_id: noteId, user_id: user.id, value })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, state: value })
  }

  if (existing.value === value) {
    const { error } = await db.from("note_reactions").delete().eq("id", existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, state: 0 })
  }

  const { error } = await db.from("note_reactions").update({ value }).eq("id", existing.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, state: value })
}
