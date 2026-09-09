"use client"
import { apiFetch } from "@/lib/base"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { Board, User } from "@/lib/db"
import { initials, timeAgo } from "@/lib/links"
import { IconPlus, IconTrash } from "./Icons"
import ConfirmDialog from "./ConfirmDialog"

export default function BoardsList({
  me,
  users,
  boards,
  counts,
}: {
  me: User
  users: User[]
  boards: Board[]
  counts: Record<string, number>
}) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Board | null>(null)

  const userMap = new Map(users.map((u) => [u.id, u]))

  async function create() {
    setBusy(true)
    const res = await apiFetch("/api/boards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok && data?.id) {
      router.push("/boards/" + data.id)
      return
    }
    setOpen(false)
  }

  async function remove() {
    if (!pendingDelete) return
    setBusy(true)
    await apiFetch("/api/boards?id=" + pendingDelete.id, { method: "DELETE" })
    setBusy(false)
    setPendingDelete(null)
    router.refresh()
  }

  return (
    <>
      {open ? (
        <div className="composer">
          <label className="field-label">Board name</label>
          <input
            className="input input-lg"
            placeholder="e.g. Q4 campaign concepts"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="composer-row" style={{ marginTop: 12 }}>
            <button className="btn btn-accent" onClick={create} disabled={busy}>
              {busy ? "Creating…" : "Create board"}
            </button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="toolbar">
          <button className="btn btn-dark" onClick={() => setOpen(true)}>
            <IconPlus /> New whiteboard
          </button>
        </div>
      )}

      {boards.length === 0 ? (
        <div className="empty">
          No canvases yet. Create one and start dropping cards.
        </div>
      ) : (
        <div className="board-grid">
          {boards.map((board) => {
            const owner = userMap.get(board.created_by)
            return (
              <div className="board-card" key={board.id}>
                <Link href={"/boards/" + board.id}>
                  <div className="board-thumb" />
                  <div className="note-cat">{counts[board.id] || 0} cards</div>
                  <h3 className="note-title" style={{ marginTop: 4 }}>
                    {board.title}
                  </h3>
                </Link>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 12,
                    gap: 8,
                  }}
                >
                  <span className="author">
                    <span className="avatar" style={{ background: owner?.color || "#8d8a84" }}>
                      {initials(owner?.display_name || "?")}
                    </span>
                    <span className="meta">{timeAgo(board.created_at)}</span>
                  </span>
                  {board.created_by === me.id ? (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setPendingDelete(board)}
                      aria-label="Delete board"
                      title="Delete board"
                    >
                      <IconTrash />
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {pendingDelete ? (
        <ConfirmDialog
          title={"Delete \u201c" + pendingDelete.title + "\u201d?"}
          message="Every card and connector on this whiteboard will be removed. This can’t be undone."
          confirmLabel="Delete whiteboard"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </>
  )
}
