import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env.local")
}

// Server-only client. Every read/write goes through server components or
// route handlers, so the key never reaches the browser.
export const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export type User = {
  id: string
  username: string
  display_name: string
  color: string
}

export type Note = {
  id: string
  author_id: string
  title: string
  description: string | null
  category: string
  tags: string[] | null
  link_url: string | null
  link_provider: string | null
  link_title: string | null
  link_thumbnail: string | null
  link_embed_url: string | null
  created_at: string
}

export type Reaction = {
  id: string
  note_id: string
  user_id: string
  value: number
}

export type Board = {
  id: string
  title: string
  description: string | null
  created_by: string
  created_at: string
}

export type ItemStyle = {
  fill?: string
  stroke?: string
  fontSize?: number
  fontWeight?: number
  align?: "left" | "center" | "right"
  color?: string
  italic?: boolean
  strokeWidth?: number
  path?: string
}

export type BoardItem = {
  id: string
  board_id: string
  created_by: string
  kind: string
  shape: string
  style: ItemStyle
  title: string | null
  body: string | null
  link_url: string | null
  link_thumbnail: string | null
  x: number
  y: number
  width: number
  height: number
}

export type BoardEdge = {
  id: string
  board_id: string
  created_by: string
  from_item: string
  to_item: string
  created_at?: string
}
