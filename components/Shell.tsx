"use client"
import { apiFetch } from "@/lib/base"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import type { User } from "@/lib/db"
import { initials } from "@/lib/links"
import { IconBoard, IconLogout, IconNotes } from "./Icons"
import ProfileModal from "./ProfileModal"
import StorageMeter from "./StorageMeter"

export default function Shell({
  user,
  children,
}: {
  user: User
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const onBoards = pathname.startsWith("/boards")
  const [profileOpen, setProfileOpen] = useState(false)

  async function logout() {
    await apiFetch("/api/auth", { method: "DELETE" })
    router.replace("/login")
    router.refresh()
  }

  return (
    <div className="shell">
      <nav className="rail" aria-label="Sections">
        <div className="rail-mark">OHQ</div>
        <Link
          href="/"
          className={"rail-btn" + (!onBoards ? " active" : "")}
          aria-label="Notes"
          title="Notes"
          prefetch
        >
          <IconNotes />
        </Link>
        <Link
          href="/boards"
          className={"rail-btn" + (onBoards ? " active" : "")}
          aria-label="Whiteboards"
          title="Whiteboards"
          prefetch
        >
          <IconBoard />
        </Link>
        <div className="rail-spacer" />
        <button className="rail-btn" onClick={logout} aria-label="Sign out" title="Sign out">
          <IconLogout />
        </button>
      </nav>

      <div className="main">
        <header className="topbar">
          <div className="wordmark">
            Outliers Hq<sup>®</sup>
          </div>
          <div className="eyebrow" style={{ marginLeft: 4 }}>
            {onBoards ? "Whiteboards" : "Notes"}
          </div>
          <div style={{ flex: 1 }} />
          <StorageMeter />
          <button
            className="author as-button"
            title="Edit your profile"
            onClick={() => setProfileOpen(true)}
          >
            <span className="avatar" style={{ background: user.color }}>
              {initials(user.display_name)}
            </span>
            <span style={{ fontWeight: 600 }}>{user.display_name}</span>
            <span className="author-edit">Edit</span>
          </button>
        </header>
        {children}
      </div>

      {profileOpen ? <ProfileModal user={user} onClose={() => setProfileOpen(false)} /> : null}
    </div>
  )
}
