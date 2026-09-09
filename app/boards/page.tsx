import { redirect } from "next/navigation"
import Shell from "@/components/Shell"
import BoardsList from "@/components/BoardsList"
import MembersStrip from "@/components/MembersStrip"
import { currentUser } from "@/lib/auth"
import { db, type Board, type User } from "@/lib/db"

export const dynamic = "force-dynamic"

export default async function BoardsPage() {
  const me = await currentUser()
  if (!me) redirect("/login")

  const [boardsRes, usersRes, itemsRes] = await Promise.all([
    db.from("whiteboards").select("*").order("created_at", { ascending: false }),
    db.from("users").select("id, username, display_name, color"),
    db.from("whiteboard_items").select("board_id"),
  ])

  const boards = (boardsRes.data || []) as Board[]
  const users = (usersRes.data || []) as User[]
  const counts: Record<string, number> = {}
  for (const row of itemsRes.data || []) {
    const key = (row as { board_id: string }).board_id
    counts[key] = (counts[key] || 0) + 1
  }

  return (
    <Shell user={me}>
      <div className="page">
        <div className="page-head">
          <div>
            <div className="eyebrow">Visual thinking</div>
            <h1 className="page-title">Whiteboards</h1>
            <p className="page-sub">Open canvases for mapping concepts, then connect the dots.</p>
            <MembersStrip users={users} me={me} />
          </div>
          <div className="stack">
            <div className="stat">
              <div className="eyebrow">Boards</div>
              <div className="stat-num">{boards.length}</div>
            </div>
            <div className="pulse">
              <div className="pulse-top">
                <span>Cards placed</span>
                <span>{users.length} people</span>
              </div>
              <div className="pulse-num">{itemsRes.data?.length || 0}</div>
              <div className="pulse-sub">across every canvas</div>
            </div>
          </div>
        </div>

        <BoardsList me={me} users={users} boards={boards} counts={counts} />
      </div>
    </Shell>
  )
}
