import { NextResponse } from "next/server"
import { currentUser } from "@/lib/auth"
import { buildPreview } from "@/lib/links"

export async function GET(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url).searchParams.get("url") || ""
  if (!url.trim()) return NextResponse.json({ preview: null })

  const preview = await buildPreview(url)
  return NextResponse.json({ preview })
}
