"use client"

import { useState } from "react"
import type { User } from "@/lib/db"
import { initials } from "@/lib/links"

/** Everyone on the team, visible to everyone. Click to see the full roster. */
export default function MembersStrip({ users, me }: { users: User[]; me: User }) {
  const [open, setOpen] = useState(false)
  const sorted = [...users].sort((a, b) => a.display_name.localeCompare(b.display_name))
  const shown = sorted.slice(0, 6)

  return (
    <>
      <button className="members-strip" onClick={() => setOpen(true)} title="See everyone on the team">
        <span className="members-avatars">
          {shown.map((u) => (
            <span key={u.id} className="avatar sm" style={{ background: u.color }}>
              {initials(u.display_name)}
            </span>
          ))}
          {sorted.length > shown.length ? (
            <span className="avatar sm more">+{sorted.length - shown.length}</span>
          ) : null}
        </span>
        <span className="members-count">
          {sorted.length} member{sorted.length === 1 ? "" : "s"}
        </span>
      </button>

      {open ? (
        <div className="modal-backdrop" onPointerDown={() => setOpen(false)}>
          <div className="modal-card" onPointerDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="modal-title">Team members</div>
                <div className="modal-sub">
                  {sorted.length} {sorted.length === 1 ? "person has" : "people have"} joined Outliers Hq
                </div>
              </div>
            </div>
            <div className="member-list">
              {sorted.map((u) => (
                <div className="member-row" key={u.id}>
                  <span className="avatar" style={{ background: u.color }}>
                    {initials(u.display_name)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="member-name">
                      {u.display_name}
                      {u.id === me.id ? <span className="member-you">you</span> : null}
                    </div>
                    <div className="meta">@{u.username}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <span className="member-dot" style={{ background: u.color }} />
                  <span className="meta">{u.color.toUpperCase()}</span>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
