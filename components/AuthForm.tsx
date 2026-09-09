"use client"

import { apiFetch } from "@/lib/base"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { PALETTE } from "@/lib/links"

type Taken = { color: string; name: string }

export default function AuthForm() {
  const router = useRouter()
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [color, setColor] = useState<string | null>(null)
  const [taken, setTaken] = useState<Taken[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mode !== "signup") return
    let alive = true
    apiFetch("/api/colors")
      .then((r) => r.json())
      .then((data) => {
        if (alive) setTaken(data?.taken || [])
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [mode])

  const takenMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of taken) map.set(t.color.toUpperCase(), t.name)
    return map
  }, [taken])

  const free = PALETTE.filter((c) => !takenMap.has(c.toUpperCase()))

  useEffect(() => {
    if (mode !== "signup") return
    if (!color || takenMap.has(color.toUpperCase())) setColor(free[0] || null)
  }, [mode, takenMap, color, free])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mode === "signup" && !color) {
      setError("Every color is claimed. Ask a teammate to free one up.")
      return
    }
    setBusy(true)
    setError(null)
    const res = await apiFetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, username, password, displayName, color }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(data?.error || "Something went wrong")
      if (mode === "signup") {
        apiFetch("/api/colors")
          .then((r) => r.json())
          .then((d) => setTaken(d?.taken || []))
          .catch(() => {})
      }
      return
    }
    router.replace("/")
    router.refresh()
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-mark">
        OHQ<sup>®</sup>
      </div>
      <div className="eyebrow" style={{ marginTop: 10 }}>
        Outliers Hq — idea workspace
      </div>

      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={"auth-tab" + (mode === "login" ? " on" : "")}
          onClick={() => setMode("login")}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          className={"auth-tab" + (mode === "signup" ? " on" : "")}
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="efaz"
          autoComplete="username"
          required
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
        />
      </div>

      {mode === "signup" ? (
        <>
          <div className="field">
            <label className="label" htmlFor="displayName">
              Name shown in the app
            </label>
            <input
              id="displayName"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Efaz"
              required
            />
          </div>

          <div className="field">
            <span className="label">Your identity color — one per teammate</span>
            <div className="swatches">
              {PALETTE.map((c) => {
                const owner = takenMap.get(c.toUpperCase())
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={owner ? "Taken by " + owner : "Pick color " + c}
                    aria-pressed={color === c}
                    disabled={!!owner}
                    title={owner ? "Taken by " + owner : "Available"}
                    className={"swatch" + (color === c ? " on" : "") + (owner ? " taken" : "")}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  >
                    {owner ? <span className="swatch-x">×</span> : null}
                  </button>
                )
              })}
            </div>
            <p className="meta" style={{ margin: "8px 0 0" }}>
              {free.length
                ? free.length + " of " + PALETTE.length + " colors still free"
                : "All colors are claimed right now"}
            </p>
          </div>
        </>
      ) : null}

      <button
        className="btn btn-dark btn-full"
        type="submit"
        disabled={busy}
        style={{ marginTop: 6 }}
      >
        {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>

      <p className="meta" style={{ marginTop: 12, marginBottom: 0 }}>
        No email needed. Username and password only.
      </p>
    </form>
  )
}
