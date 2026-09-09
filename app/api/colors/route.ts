import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// Identity colors are one-per-person, so the signup form needs to know which
// ones are already claimed.
export async function GET() {
  const { data } = await db.from("users").select("color, display_name")
  const taken = (data || []).map((row) => ({
    color: String((row as { color: string }).color || "").toUpperCase(),
    name: (row as { display_name: string }).display_name,
  }))
  return NextResponse.json({ taken })
}
