"use client"

import { useEffect } from "react"

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel()
      if (e.key === "Enter") onConfirm()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel, onConfirm])

  return (
    <div className="modal-backdrop" onPointerDown={onCancel}>
      <div
        className="modal-card confirm-card"
        role="alertdialog"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-icon danger">!</span>
          <div>
            <div className="modal-title">{title}</div>
            <div className="modal-sub">{message}</div>
          </div>
        </div>
        <div className="modal-actions">
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className="btn btn-danger btn-sm" onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? "Deleting\u2026" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
