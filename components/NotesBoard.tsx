"use client"

import { apiFetch } from "@/lib/base"
import { useEffect, useMemo, useState } from "react"
import type { Note, Reaction, User } from "@/lib/db"
import { CATEGORIES, initials, timeAgo } from "@/lib/links"
import { IconDown, IconLink, IconPlay, IconPlus, IconSearch, IconTrash, IconUp } from "./Icons"
import ConfirmDialog from "./ConfirmDialog"

type Preview = {
  provider: string
  url: string
  title: string | null
  thumbnail: string | null
  embedUrl: string | null
}

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

  const [query, setQuery] = useState("")
  const [cat, setCat] = useState<string | null>(null)
  const [authorFilter, setAuthorFilter] = useState<string | null>(null)

  useEffect(() => setNotes(initialNotes), [initialNotes])
  useEffect(() => setReactions(initialReactions), [initialReactions])

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

  // Built-in suggestions plus every custom category the team has typed.
  const allCategories = useMemo(() => {
    const set = new Set<string>(CATEGORIES)
    for (const n of notes) if (n.category) set.add(n.category)
    return Array.from(set)
  }, [notes])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return notes.filter((n) => {
      if (cat && n.category !== cat) return false
      if (authorFilter && n.author_id !== authorFilter) return false
      if (!q) return true
      return [n.title, n.description, n.link_url, (n.tags || []).join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    })
  }, [notes, query, cat, authorFilter])

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
    setOpen(false)
  }

  // Optimistic: the UI flips instantly, the request settles in the background.
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
          title={"Delete \u201c" + pendingDelete.title + "\u201d?"}
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
      {open ? (
        <div className="composer">
          {error ? <div className="error">{error}</div> : null}
          <label className="field-label">Idea title (required)</label>
          <input
            className="input input-lg"
            placeholder="Give the idea a short name…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <textarea
            className="textarea"
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
              className="input"
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
              className="input"
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
      ) : null}

      <div className="toolbar">
        {!open ? (
          <button className="btn btn-dark" onClick={() => setOpen(true)}>
            <IconPlus /> New note
          </button>
        ) : null}
        <div className="search">
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
          <button className={"chip" + (cat === null ? " on" : "")} onClick={() => setCat(null)}>
            All
          </button>
          {allCategories.map((c) => (
            <button
              key={c}
              className={"chip" + (cat === c ? " on" : "")}
              onClick={() => setCat(cat === c ? null : c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
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
        <div className="grid">
          {visible.map((note) => {
            const author = userMap.get(note.author_id)
            const list = reactionsByNote.get(note.id) || []
            const ups = list.filter((r) => r.value === 1)
            const downs = list.filter((r) => r.value === -1)
            const mine = list.find((r) => r.user_id === me.id)?.value || 0
            const names = (arr: Reaction[]) =>
              arr.map((r) => userMap.get(r.user_id)?.display_name || "Someone").join(", ")

            return (
              <article className="note" key={note.id}>
                <div
                  className="note-accent"
                  style={{ background: author?.color || "var(--line-strong)" }}
                />
                {note.link_thumbnail ? (
                  <div className="note-media">
                    <img src={note.link_thumbnail} alt="" loading="lazy" />
                    {note.link_embed_url ? (
                      <a
                        className="play"
                        href={note.link_url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open video"
                      >
                        <span>
                          <IconPlay />
                        </span>
                      </a>
                    ) : null}
                    {note.link_provider ? (
                      <span className="provider-tag">{note.link_provider}</span>
                    ) : null}
                  </div>
                ) : null}

                <div className="note-body">
                  <div className="note-cat">{note.category}</div>
                  <h3 className="note-title">{note.title}</h3>
                  {note.description ? <p className="note-desc">{note.description}</p> : null}
                  {note.link_url ? (
                    <a className="note-link" href={note.link_url} target="_blank" rel="noreferrer">
                      <IconLink />
                      {note.link_title || note.link_url}
                    </a>
                  ) : null}
                  {note.tags && note.tags.length ? (
                    <div className="note-tags">
                      {note.tags.map((t) => (
                        <span className="tag" key={t}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {ups.length || downs.length ? (
                  <div className="reactors">
                    {ups.length ? (
                      <div className="reactors-row">
                        <b>Liked</b> <span>{names(ups)}</span>
                      </div>
                    ) : null}
                    {downs.length ? (
                      <div className="reactors-row">
                        <b>Not for me</b> <span>{names(downs)}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="note-foot">
                  <span className="author">
                    <span
                      className="avatar"
                      style={{ background: author?.color || "#8d8a84" }}
                      title={author?.display_name || "Unknown"}
                    >
                      {initials(author?.display_name || "?")}
                    </span>
                    <span>
                      <span style={{ fontWeight: 600 }}>{author?.display_name || "Unknown"}</span>
                      <span className="meta"> · {timeAgo(note.created_at)}</span>
                    </span>
                  </span>
                  <span className="react-group">
                    <button
                      className={"react" + (mine === 1 ? " on-up" : "")}
                      onClick={() => react(note.id, 1)}
                      title={ups.length ? "Liked by " + names(ups) : "Like this"}
                    >
                      <IconUp /> {ups.length}
                    </button>
                    <button
                      className={"react" + (mine === -1 ? " on-down" : "")}
                      onClick={() => react(note.id, -1)}
                      title={downs.length ? "Disliked by " + names(downs) : "Not for me"}
                    >
                      <IconDown /> {downs.length}
                    </button>
                    {note.author_id === me.id ? (
                      <button
                        className="react"
                        onClick={() => setPendingDelete(note)}
                        title="Delete my note"
                        aria-label="Delete my note"
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
