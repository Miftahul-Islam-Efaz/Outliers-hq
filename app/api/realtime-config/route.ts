import { NextRequest } from "next/server"
import { currentUser } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Hands the browser what it needs to open a Supabase Realtime socket.
 *
 * Only the project URL and the publishable (anon) key are returned. That key
 * is designed to live in the browser and every table is behind RLS, so this
 * exposes nothing that a signed-in user could not already reach. It is served
 * from the server rather than baked in as a NEXT_PUBLIC_* build variable so
 * that deploys keep working without adding new environment variables.
 *
 * A session is still required: anonymous visitors get nothing.
 */
export async function GET(_req: NextRequest) {
  const user = await currentUser()
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 })

  const url = (process.env.SUPABASE_URL || "").trim()
  const key = (process.env.SUPABASE_ANON_KEY || "").trim()
  if (!url || !key) {
    return Response.json({ error: "Realtime is not configured" }, { status: 503 })
  }

  return Response.json({ url, key })
}
