import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hashPassword, verifyPassword } from "@/lib/password"
import { COOKIE_NAME, cookieOptions, makeToken } from "@/lib/auth"
import { PALETTE } from "@/lib/links"

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const mode = body?.mode === "signup" ? "signup" : "login"
  const username = String(body?.username || "").trim().toLowerCase()
  const password = String(body?.password || "")

  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3-24 characters: letters, numbers, . _ -" },
      { status: 400 },
    )
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
  }

  if (mode === "signup") {
    const displayName = String(body?.displayName || "").trim()
    const color = String(body?.color || "").toUpperCase()
    if (displayName.length < 2) {
      return NextResponse.json({ error: "Add the name your team will see" }, { status: 400 })
    }
    if (!PALETTE.map((c) => c.toUpperCase()).includes(color)) {
      return NextResponse.json({ error: "Pick one of the identity colors" }, { status: 400 })
    }

    const { data: existing } = await db
      .from("users")
      .select("id")
      .eq("username", username)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: "That username is taken" }, { status: 409 })
    }

    // One identity color per teammate, so cards and connectors always map to
    // exactly one person.
    const { data: colorOwner } = await db
      .from("users")
      .select("display_name")
      .ilike("color", color)
      .maybeSingle()
    if (colorOwner) {
      return NextResponse.json(
        {
          error:
            "That color already belongs to " +
            (colorOwner as { display_name: string }).display_name +
            ". Pick another one.",
        },
        { status: 409 },
      )
    }

    const { data, error } = await db
      .from("users")
      .insert({
        username,
        display_name: displayName,
        color,
        password_hash: hashPassword(password),
      })
      .select("id")
      .single()

    if (error || !data) {
      const message = /users_color_unique/.test(error?.message || "")
        ? "Someone just claimed that color. Pick another one."
        : error?.message || "Could not create account"
      return NextResponse.json({ error: message }, { status: 409 })
    }

    const res = NextResponse.json({ ok: true })
    res.cookies.set(COOKIE_NAME, makeToken(data.id), cookieOptions)
    return res
  }

  const { data: user } = await db
    .from("users")
    .select("id, password_hash")
    .eq("username", username)
    .maybeSingle()

  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "Wrong username or password" }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, makeToken(user.id), cookieOptions)
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 })
  return res
}
