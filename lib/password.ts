import crypto from "crypto"

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.scryptSync(password, salt, 64).toString("hex")
  return "scrypt$" + salt + "$" + hash
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$")
  if (parts.length !== 3 || parts[0] !== "scrypt") return false
  const salt = parts[1]
  const hash = parts[2]
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex")
  const a = Buffer.from(candidate, "hex")
  const b = Buffer.from(hash, "hex")
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
