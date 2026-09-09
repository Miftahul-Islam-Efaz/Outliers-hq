"use client"

import { useEffect, useState } from "react"
import { IconLink } from "./Icons"

const SUGGESTIONS = ["YouTube video", "Instagram post", "Facebook video", "Any web page"]

export default function LinkModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (url: string) => void
}) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  function submit() {
    const url = value.trim()
    if (!url) {
      setError("Paste a link first")
      return
    }
    onSubmit(url)
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setValue(text.trim())
        setError(null)
      }
    } catch {
      setError("Your browser blocked clipboard access — paste with Ctrl+V")
    }
  }

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="modal-card" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-icon">
            <IconLink />
          </span>
          <div>
            <div className="modal-title">Add a link card</div>
            <div className="modal-sub">We’ll pull in the title and thumbnail automatically</div>
          </div>
        </div>

        <input
          className="modal-input"
          autoFocus
          value={value}
          placeholder="https://…"
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Enter") submit()
          }}
        />

        <div className="modal-chips">
          {SUGGESTIONS.map((s) => (
            <span key={s} className="modal-chip">
              {s}
            </span>
          ))}
        </div>

        {error ? <div className="modal-error">{error}</div> : null}

        <div className="modal-actions">
          <button className="btn btn-ghost btn-sm" onClick={pasteFromClipboard}>
            Paste
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={submit}>
            Add card
          </button>
        </div>
      </div>
    </div>
  )
}
