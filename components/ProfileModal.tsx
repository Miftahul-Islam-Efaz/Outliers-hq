"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { apiFetch } from "@/lib/base"
import type { User } from "@/lib/db"
import { PALETTE } from "@/lib/links"

export default function ProfileModal({ user, onClose }: { user: User; onClose: () => void }) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState(user.display_name)
  const [color, setColor] = useState(user.color.toUpperCase())
  const [taken, setTaken] = useState<Record<string, string>>({})
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch("/api/colors")
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, string> = {}
        for (const row of data?.taken || []) {
          if (String(row.color).toUpperCase() !== user.color.toUpperCase()) {
            map[String(row.color).toUpperCase()] = row.name
          }
        }
        setTaken(map)
      })
      .catch(() => {})
  }, [user.color])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function save() {
    setError(null)
    setSaving(true)
    const payload: Record<string, unknown> = { displayName, color }
    if (newPassword) {
      payload.newPassword = newPassword
      payload.currentPassword = currentPassword
    }
    const res = await apiFetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(data?.error || "Could not save your profile")
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal-card" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="avatar" style={{ background: color }}>
            {displayName.slice(0, 1).toUpperCase() || "?"}
          </span>
          <div>
            <div className="modal-title">Your profile</div>
            <div className="modal-sub">@{user.username} · username can’t be changed</div>
          </div>
        </div>

        <label className="modal-label">Display name</label>
        <input
          className="modal-input"
          value={displayName}
          maxLength={60}
          onChange={(e) => setDisplayName(e.target.value)}
        />

        <label className="modal-label">Your colour</label>
        <div className="modal-swatches">
          {PALETTE.map((c) => {
            const key = c.toUpperCase()
            const owner = taken[key]
            return (
              <button
                key={c}
                type="button"
                className={
                  "swatch" + (color === key ? " on" : "") + (owner ? " taken" : "")
                }
                style={{ background: c }}
                title={owner ? "Used by " + owner : c}
                disabled={!!owner}
                onClick={() => setColor(key)}
              >
                {owner ? <span className="swatch-x">×</span> : null}
              </button>
            )
          })}
        </div>

        <label className="modal-label">Change password (optional)</label>
        <input
          className="modal-input"
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <input
          className="modal-input"
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />

        {error ? <div className="modal-error">{error}</div> : null}

        <div className="modal-actions">
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>
    </div>
  )
}
