import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { currentUser } from "@/lib/auth"
import { hashPassword, verifyPassword } from "@/lib/password"

/** Anyone can edit their own name, identity colour, or password. */
export async function PATCH(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}

  if (typeof body?.displayName === "string") {
    const displayName = body.displayName.trim().slice(0, 60)
    if (!displayName) return NextResponse.json({ error: "Add your name" }, { status: 400 })
    patch.display_name = displayName
  }

  if (typeof body?.color === "string" && body.color.trim()) {
    const color = body.color.trim().toUpperCase()
    if (!/^#[0-9A-F]{6}$/.test(color)) {
      return NextResponse.json({ error: "Pick a valid colour" }, { status: 400 })
    }
    const { data: clash } = await db
      .from("users")
      .select("id, display_name, color")
      .neq("id", user.id)
    const owner = (clash || []).find(
      (row) => String((row as { color: string }).color || "").toUpperCase() === color,
    ) as { display_name: string } | undefined
    if (owner) {
      return NextResponse.json(
        { error: owner.display_name + " already uses that colour" },
        { status: 409 },
      )
    }
    patch.color = color
  }

  if (typeof body?.newPassword === "string" && body.newPassword) {
    if (String(body.newPassword).length < 4) {
      return NextResponse.json({ error: "Use at least 4 characters" }, { status: 400 })
    }
    const { data: row } = await db
      .from("users")
      .select("password_hash")
      .eq("id", user.id)
      .maybeSingle()
    const stored = (row as { password_hash?: string } | null)?.password_hash || ""
    if (!verifyPassword(String(body?.currentPassword || ""), stored)) {
      return NextResponse.json({ error: "Current password is wrong" }, { status: 403 })
    }
    patch.password_hash = hashPassword(String(body.newPassword))
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 })
  }

  const { data, error } = await db
    .from("users")
    .update(patch)
    .eq("id", user.id)
    .select("id, username, display_name, color")
    .single()

  if (error) {
    const taken = error.message.includes("users_color_unique")
    return NextResponse.json(
      { error: taken ? "Someone already uses that colour" : error.message },
      { status: taken ? 409 : 500 },
    )
  }
  return NextResponse.json({ ok: true, user: data })
}
