"use client"

import { apiFetch } from "@/lib/base"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { IconTrash } from "./Icons"
import ConfirmDialog from "./ConfirmDialog"

// Milanote-style: click the board name to rename it in place.
export default function BoardTitle({
  boardId,
  initialTitle,
  canDelete,
}: {
  boardId: string
  initialTitle: string
  canDelete: boolean
}) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [draft, setDraft] = useState(initialTitle)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function save() {
    const next = draft.trim() || "Untitled board"
    setEditing(false)
    if (next === title) return
    setTitle(next)
    setBusy(true)
    const res = await apiFetch("/api/boards", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: boardId, title: next }),
    })
    setBusy(false)
    if (!res.ok) {
      setTitle(title)
      setDraft(title)
    }
  }

  async function removeBoard() {
    setBusy(true)
    const res = await apiFetch("/api/boards?id=" + boardId, { method: "DELETE" })
    setBusy(false)
    setConfirming(false)
    if (res.ok) {
      router.push("/boards")
      router.refresh()
    }
  }

  return (
    <div className="board-title" style={{ minWidth: 0 }}>
      <div className="eyebrow">Whiteboard</div>
      {editing ? (
        <input
          className="board-title-input"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save()
            if (e.key === "Escape") {
              setDraft(title)
              setEditing(false)
            }
          }}
          aria-label="Board name"
        />
      ) : (
        <button
          className="board-title-text"
          title="Click to rename"
          onClick={() => {
            setDraft(title)
            setEditing(true)
          }}
        >
          {title}
          {busy ? <span className="meta"> saving…</span> : null}
        </button>
      )}
      {canDelete ? (
        <button
          className="board-del"
          onClick={() => setConfirming(true)}
          title="Delete this whiteboard"
        >
          <IconTrash />
        </button>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title={"Delete \u201c" + title + "\u201d?"}
          message="Every card, connector and image on this whiteboard will be removed. This can’t be undone."
          confirmLabel="Delete whiteboard"
          busy={busy}
          onConfirm={removeBoard}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  )
}
