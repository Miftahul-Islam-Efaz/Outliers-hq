import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import Canvas from "@/components/Canvas"
import BoardTitle from "@/components/BoardTitle"
import { currentUser } from "@/lib/auth"
import { db, type Board, type BoardEdge, type BoardItem, type User } from "@/lib/db"
import { initials } from "@/lib/links"

export const dynamic = "force-dynamic"

export default async function BoardPage({ params }: { params: { id: string } }) {
  const me = await currentUser()
  if (!me) redirect("/login")

  const { data: board } = await db
    .from("whiteboards")
    .select("*")
    .eq("id", params.id)
    .maybeSingle()

  if (!board) notFound()

  const [itemsRes, edgesRes, usersRes] = await Promise.all([
    db.from("whiteboard_items").select("*").eq("board_id", params.id),
    db.from("whiteboard_edges").select("*").eq("board_id", params.id),
    db.from("users").select("id, username, display_name, color"),
  ])

  const record = board as Board

  return (
    <div className="shell">
      <div className="main">
        <header className="topbar">
          <Link href="/boards" className="btn btn-ghost btn-sm">
            ← Boards
          </Link>
          <BoardTitle
            boardId={params.id}
            initialTitle={record.title}
            canDelete={record.created_by === me.id}
          />
          <div style={{ flex: 1 }} />
          <div className="author">
            <span className="avatar" style={{ background: me.color }}>
              {initials(me.display_name)}
            </span>
            <span style={{ fontWeight: 600 }}>{me.display_name}</span>
          </div>
        </header>

        <Canvas
          boardId={params.id}
          me={me}
          users={(usersRes.data || []) as User[]}
          initialItems={(itemsRes.data || []) as BoardItem[]}
          initialEdges={(edgesRes.data || []) as BoardEdge[]}
        />
      </div>
    </div>
  )
}
