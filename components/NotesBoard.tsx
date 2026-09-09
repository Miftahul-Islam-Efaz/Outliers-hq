"use client"

import { apiFetch } from "@/lib/base"
import { useEffect, useMemo, useRef, useState } from "react"
import type { Note, Reaction, User } from "@/lib/db"
import { CATEGORIES, initials, timeAgo } from "@/lib/links"
import { IconDown, IconPlus, IconSearch, IconTrash, IconUp } from "./Icons"
import ConfirmDialog from "./ConfirmDialog"
import TileArt from "./TileArt"
import { artAtTop, artFor, ASPECT, assignSwatches, hashId, sizeFor } from "@/lib/mosaic"

type Preview = {
  provider: string
  url: string
  title: string | null
  thumbnail: string | null
  embedUrl: string | null
}

type FieldName = "title" | "description" | "category" | "tags"

export default function NotesBoard({
  me,
  users,
  notes: initialNotes,
  reactions: initialReactions,
}: {
  me: User
  users: User[]
  notes: Note[]
  reactions: Reaction[]
}) {
  const [notes, setNotes] = useState(initialNotes)
  const [reactions, setReactions] = useState(initialReactions)

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [tags, setTags] = useState("")
  const [url, setUrl] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null)

  // --- AI box state ---------------------------------------------------------
  const [raw, setRaw] = useState("")
  const [organizing, setOrganizing] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiDrafted, setAiDrafted] = useState(false)
  const [askReplace, setAskReplace] = useState(false)
  const [flash, setFlash] = useState<Record<string, boolean>>({})
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])

  const [query, setQuery] = useState("")
  const [authorFilter, setAuthorFilter] = useState<string | null>(null)

  useEffect(() => setNotes(initialNotes), [initialNotes])
  useEffect(() => setReactions(initialReactions), [initialReactions])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  const reactionsByNote = useMemo(() => {
    const map = new Map<string, Reaction[]>()
    for (const r of reactions) {
      const list = map.get(r.note_id) || []
      list.push(r)
      map.set(r.note_id, list)
    }
    return map
  }, [reactions])

  const allCategories = useMemo(() => {
    const set = new Set<string>(CATEGORIES)
    for (const n of notes) if (n.category) set.add(n.category)
    return Array.from(set)
  }, [notes])

  // Search matches title, description, category and tags together.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return notes.filter((n) => {
      if (authorFilter && n.author_id !== authorFilter) return false
      if (!q) return true
      return [n.title, n.description, n.category, (n.tags || []).join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    })
  }, [notes, query, authorFilter])

  // Colours are resolved across the rendered order so no two touching tiles
  // share a colour, while staying stable for a given idea.
  const swatches = useMemo(() => assignSwatches(visible.map((n) => n.id)), [visible])

  async function loadPreview(value: string) {
    setUrl(value)
    if (!value.trim()) {
      setPreview(null)
      return
    }
    setLoadingPreview(true)
    const res = await apiFetch("/api/preview?url=" + encodeURIComponent(value))
    const data = await res.json().catch(() => ({}))
    setLoadingPreview(false)
    setPreview(data?.preview || null)
  }

  /** Briefly outlines an input in orange as its value lands. */
  function flashField(name: FieldName, delay: number, apply: () => void) {
    timers.current.push(
      setTimeout(() => {
        apply()
        setFlash((f) => ({ ...f, [name]: true }))
        timers.current.push(
          setTimeout(() => setFlash((f) => ({ ...f, [name]: false })), 400),
        )
      }, delay),
    )
  }

  const formHasContent = () =>
    Boolean(title.trim() || description.trim() || category.trim() || tags.trim())

  function requestOrganize() {
    if (raw.trim().length < 12) {
      setAiError("Paste a bit more text first.")
      return
    }
    if (formHasContent()) {
      setAskReplace(true)
      return
    }
    void organize()
  }

  /**
   * Asks the model for strict JSON and fills the manual form with it.
   * Nothing is written to the database here — the user still presses Save.
   */
  async function organize() {
    setOrganizing(true)
    setAiError(null)
    try {
      let result: Record<string, unknown> | null = null

      // One retry, because a malformed reply is usually transient.
      for (let attempt = 0; attempt < 2 && !result; attempt++) {
        const res = await apiFetch("/api/organize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: raw }),
        })
        const data = await res.json().catch(() => null)
        if (res.status === 401 || res.status === 429) {
          setAiError(data?.error || "Too many requests — wait a moment and try again.")
          return
        }
        const candidate = data?.result
        if (candidate && typeof candidate.title === "string" && candidate.title.trim()) {
          result = candidate
        }
      }

      if (!result) {
        setAiError("Couldn’t organize that — try again, or fill the fields manually.")
        return
      }

      // Fill in sequence so it reads as the form being written into.
      const list = Array.isArray(result.tags) ? (result.tags as string[]) : []
      flashField("title", 0, () => setTitle(String(result!.title || "").slice(0, 80)))
      flashField("description", 80, () => setDescription(String(result!.description || "")))
      flashField("category", 160, () => setCategory(String(result!.category || "")))
      flashField("tags", 240, () => setTags(list.join(", ")))
      setAiDrafted(true)
    } catch {
      setAiError("Couldn’t organize that — try again, or fill the fields manually.")
    } finally {
      setOrganizing(false)
    }
  }

  async function save() {
    if (!title.trim()) {
      setError("Give the note a title")
      return
    }
    if (!description.trim()) {
      setError("Add a description for the note")
      return
    }
    setSaving(true)
    setError(null)
    const res = await apiFetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, description, category, tags, url }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(data?.error || "Could not save")
      return
    }
    if (data?.note) setNotes((prev) => [data.note as Note, ...prev])
    setTitle("")
    setDescription("")
    setCategory("")
    setTags("")
    setUrl("")
    setPreview(null)
    setRaw("")
    setAiDrafted(false)
    setOpen(false)
  }

  async function react(noteId: string, value: 1 | -1) {
    const mine = reactions.find((r) => r.note_id === noteId && r.user_id === me.id)
    const snapshot = reactions
    let next: Reaction[]
    if (!mine) {
      next = [...reactions, { id: "tmp-" + noteId, note_id: noteId, user_id: me.id, value }]
    } else if (mine.value === value) {
      next = reactions.filter((r) => r !== mine)
    } else {
      next = reactions.map((r) => (r === mine ? { ...r, value } : r))
    }
    setReactions(next)
    const res = await apiFetch("/api/reactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ noteId, value }),
    })
    if (!res.ok) setReactions(snapshot)
  }

  async function remove(noteId: string) {
    const snapshot = notes
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
    const res = await apiFetch("/api/notes?id=" + noteId, { method: "DELETE" })
    if (!res.ok) {
      setNotes(snapshot)
      const data = await res.json().catch(() => ({}))
      setError(data?.error || "Could not delete that note")
    }
  }

  return (
    <>
      {pendingDelete ? (
        <ConfirmDialog
          title={"Delete “" + pendingDelete.title + "”?"}
          message="This idea and its reactions will be removed for the whole team. This can’t be undone."
          confirmLabel="Delete note"
          onConfirm={() => {
            const target = pendingDelete
            setPendingDelete(null)
            if (target) remove(target.id)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}

      {askReplace ? (
        <ConfirmDialog
          title="Replace what you’ve written?"
          message="The title, description, category and tags you have already filled in will be overwritten by the AI draft."
          confirmLabel="Replace"
          onConfirm={() => {
            setAskReplace(false)
            void organize()
          }}
          onCancel={() => setAskReplace(false)}
        />
      ) : null}

      {open ? (
        <div className="composer-split">
          <div className="composer">
            {error ? <div className="error">{error}</div> : null}
            {aiDrafted ? (
              <div className="ai-note">Drafted by AI — review and edit before saving.</div>
            ) : null}

            <label className="field-label">Idea title (required)</label>
            <input
              className={"input input-lg" + (flash.title ? " filled" : "")}
              placeholder="Give the idea a short name…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <textarea
              className={"textarea" + (flash.description ? " filled" : "")}
              placeholder="Description (required) — context, why it matters, what to do next…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="composer-grid">
              <input
                className="input"
                placeholder="Link (optional) — YouTube, Instagram, Facebook, anything"
                value={url}
                onChange={(e) => loadPreview(e.target.value)}
              />
              <input
                className={"input" + (flash.category ? " filled" : "")}
                list="ohq-categories"
                placeholder="Category (optional, type your own)"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <datalist id="ohq-categories">
                {allCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <input
                className={"input" + (flash.tags ? " filled" : "")}
                placeholder="Tags (optional, comma separated)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>

            {loadingPreview ? (
              <div className="preview-strip">
                <span className="meta">Fetching preview…</span>
              </div>
            ) : preview ? (
              <div className="preview-strip">
                {preview.thumbnail ? <img src={preview.thumbnail} alt="" /> : null}
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow">{preview.provider}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {preview.title || preview.url}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="composer-row" style={{ marginTop: 14 }}>
              <button className="btn btn-accent" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save idea"}
              </button>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <div style={{ flex: 1 }} />
              <span className="author">
                <span className="avatar" style={{ background: me.color }}>
                  {initials(me.display_name)}
                </span>
                posting as {me.display_name}
              </span>
            </div>
          </div>

          <aside className="ai-box">
            <svg
              className="ai-box-art"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
            >
              <g fill="none" stroke="#EDEAE0" strokeWidth="1" vectorEffect="non-scaling-stroke">
                <circle cx="88" cy="14" r="58" />
                <circle cx="88" cy="14" r="42" />
                <circle cx="88" cy="14" r="26" />
                <circle cx="88" cy="14" r="12" />
              </g>
            </svg>

            <div className="ai-eyebrow">Paste anything</div>
            <p className="ai-help">
              Drop a long note, a message, a transcript. It gets sorted into fields you can edit.
            </p>

            <textarea
              className="ai-textarea"
              placeholder="Paste your raw thoughts here — as long and as messy as you like."
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />

            {aiError ? <div className="ai-error">{aiError}</div> : null}

            <div className="ai-foot">
              <span className="ai-count">{raw.length} characters</span>
              <div className="ai-actions">
                <button
                  className="ai-clear"
                  onClick={() => {
                    setRaw("")
                    setAiError(null)
                  }}
                  disabled={organizing || !raw}
                >
                  Clear
                </button>
                <button
                  className={"ai-run" + (organizing ? " busy" : "")}
                  onClick={requestOrganize}
                  disabled={organizing}
                >
                  <span className="ai-diamond" aria-hidden="true" />
                  {organizing ? "Organizing…" : "Organize with AI"}
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="toolbar">
        {!open ? (
          <button className="btn btn-dark" onClick={() => setOpen(true)}>
            <IconPlus /> New note
          </button>
        ) : null}
        <div className="search search-wide">
          <IconSearch />
          <input
            className="input"
            placeholder="Search ideas"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search ideas"
          />
        </div>
        <div className="chip-row">
          {users.map((u) => (
            <button
              key={u.id}
              className={"chip" + (authorFilter === u.id ? " on" : "")}
              onClick={() => setAuthorFilter(authorFilter === u.id ? null : u.id)}
              title={"Only " + u.display_name}
            >
              <span className="dot" style={{ background: u.color }} />
              {u.display_name}
            </button>
          ))}
        </div>
      </div>

      {!open && error ? <div className="error">{error}</div> : null}

      {visible.length === 0 ? (
        <div className="empty">
          Nothing here yet. Hit <b>New note</b> and drop the first idea.
        </div>
      ) : (
        <div className="mosaic">
          {visible.map((note, index) => {
            const author = userMap.get(note.author_id)
            const list = reactionsByNote.get(note.id) || []
            const ups = list.filter((r) => r.value === 1)
            const downs = list.filter((r) => r.value === -1)
            const mine = list.find((r) => r.user_id === me.id)?.value || 0
            const names = (arr: Reaction[]) =>
              arr.map((r) => userMap.get(r.user_id)?.display_name || "Someone").join(", ")

            const hash = hashId(note.id)
            const size = sizeFor(hash)
            const swatch = swatches[index]
            const topArt = artAtTop(hash)

            return (
              <article
                className={"tile tile-" + size + (topArt ? " art-top" : "")}
                key={note.id}
                style={{
                  background: swatch.bg,
                  color: swatch.fg,
                  ["--tile-ink" as string]: swatch.fg,
                  ["--tile-aspect" as string]: ASPECT[size],
                }}
              >
                <TileArt variant={artFor(hash)} color={swatch.fg} />

                <div className="tile-copy">
                  <div className="tile-cat">{note.category || "Idea"}</div>
                  <h3 className="tile-title">{note.title}</h3>
                  {size !== "short" && note.description ? (
                    <p className="tile-desc">{note.description}</p>
                  ) : null}
                </div>

                <div className="tile-foot">
                  <span className="tile-author">
                    <span className="tile-dot" style={{ background: author?.color || "#8d8a84" }} />
                    {author?.display_name || "Unknown"} · {timeAgo(note.created_at)}
                  </span>
                  <span className="tile-votes">
                    <button
                      className={"tile-vote" + (mine === 1 ? " on" : "")}
                      onClick={() => react(note.id, 1)}
                      title={ups.length ? "Liked by " + names(ups) : "Like this"}
                    >
                      <IconUp /> {ups.length}
                    </button>
                    <button
                      className={"tile-vote" + (mine === -1 ? " on" : "")}
                      onClick={() => react(note.id, -1)}
                      title={downs.length ? "Disliked by " + names(downs) : "Not for me"}
                    >
                      <IconDown /> {downs.length}
                    </button>
                    {note.author_id === me.id ? (
                      <button
                        className="tile-vote"
                        onClick={() => setPendingDelete(note)}
                        aria-label="Delete my note"
                        title="Delete my note"
                      >
                        <IconTrash />
                      </button>
                    ) : null}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
