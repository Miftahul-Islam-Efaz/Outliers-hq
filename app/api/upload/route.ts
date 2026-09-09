import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { currentUser } from "@/lib/auth"

const BUCKET = "board-media"
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]
const MAX_BYTES = 8 * 1024 * 1024

/** Accepts a base64 data URL from a canvas paste and returns a public image URL. */
export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const dataUrl = String(body?.dataUrl || "")
  const match = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return NextResponse.json({ error: "Expected a base64 image" }, { status: 400 })

  const contentType = match[1]
  if (!ALLOWED.includes(contentType)) {
    return NextResponse.json({ error: "That image type is not supported" }, { status: 400 })
  }

  const bytes = Buffer.from(match[2], "base64")
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image is larger than 8MB" }, { status: 400 })
  }

  const ext = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1].replace("+xml", "")
  const path = user.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext

  const upload = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false })
  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 })
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ ok: true, url: data.publicUrl })
}
