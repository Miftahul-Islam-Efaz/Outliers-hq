import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { currentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Supabase's free plan includes 1 GB of file storage.
const FREE_LIMIT_BYTES = 1024 * 1024 * 1024

// The figure barely moves between page views, so a short cache keeps this from
// becoming a per-render database call.
let cache: { at: number; payload: unknown } | null = null
const TTL_MS = 30_000

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.payload)
  }

  const { data, error } = await db.rpc("storage_usage")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const row = (Array.isArray(data) ? data[0] : data) as
    | { bytes: number | string; files: number | string }
    | undefined

  const bytes = Number(row?.bytes || 0)
  const payload = {
    ok: true,
    bytes,
    files: Number(row?.files || 0),
    limit: FREE_LIMIT_BYTES,
    percent: Math.min(100, (bytes / FREE_LIMIT_BYTES) * 100),
  }
  cache = { at: Date.now(), payload }
  return NextResponse.json(payload)
}
