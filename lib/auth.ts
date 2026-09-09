import crypto from "crypto"
import { cookies } from "next/headers"
import { db, type User } from "./db"

export const COOKIE_NAME = "ohq_session"
const secret = process.env.AUTH_SECRET || "dev-secret"

function sign(value: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url")
}

export function makeToken(userId: string) {
  return userId + "." + sign(userId)
}

export function readToken(token: string | undefined): string | null {
  if (!token) return null
  const idx = token.lastIndexOf(".")
  if (idx < 1) return null
  const userId = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const expected = sign(userId)
  if (sig.length !== expected.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  return userId
}

export const cookieOptions = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 60,
}

export async function currentUser(): Promise<User | null> {
  const userId = readToken(cookies().get(COOKIE_NAME)?.value)
  if (!userId) return null
  const { data } = await db
    .from("users")
    .select("id, username, display_name, color")
    .eq("id", userId)
    .maybeSingle()
  return (data as User | null) || null
}
