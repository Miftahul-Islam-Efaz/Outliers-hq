import { redirect } from "next/navigation"
import Shell from "@/components/Shell"
import NotesBoard from "@/components/NotesBoard"
import MembersStrip from "@/components/MembersStrip"
import { currentUser } from "@/lib/auth"
import { db, type Note, type Reaction, type User } from "@/lib/db"

export const dynamic = "force-dynamic"

export default async function NotesPage() {
  const me = await currentUser()
  if (!me) redirect("/login")

  const [notesRes, usersRes, reactionsRes] = await Promise.all([
    db.from("notes").select("*").order("created_at", { ascending: false }).limit(300),
    db.from("users").select("id, username, display_name, color"),
    db.from("note_reactions").select("id, note_id, user_id, value"),
  ])

  const notes = (notesRes.data || []) as Note[]
  const users = (usersRes.data || []) as User[]
  const reactions = (reactionsRes.data || []) as Reaction[]

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const thisWeek = notes.filter((n) => new Date(n.created_at).getTime() > weekAgo).length
  const withLinks = notes.filter((n) => !!n.link_url).length

  return (
    <Shell user={me}>
      <div className="page">
        <div className="page-head">
          <div>
            <div className="eyebrow">Idea vault</div>
            <h1 className="page-title">Notes</h1>
            <p className="page-sub">
              Everything the team thinks of — written, pasted, and kept in one grid.
            </p>
            <MembersStrip users={users} me={me} />
          </div>
          <div className="stack">
            <div className="stat">
              <div className="eyebrow">Total</div>
              <div className="stat-num">{notes.length}</div>
            </div>
            <div className="stat">
              <div className="eyebrow">Links saved</div>
              <div className="stat-num">{withLinks}</div>
            </div>
            <div className="pulse">
              <div className="pulse-top">
                <span>This week</span>
                <span>{users.length} people</span>
              </div>
              <div className="pulse-num">{thisWeek}</div>
              <div className="pulse-sub">new ideas in the last 7 days</div>
            </div>
          </div>
        </div>

        <NotesBoard me={me} users={users} notes={notes} reactions={reactions} />
      </div>
    </Shell>
  )
}
