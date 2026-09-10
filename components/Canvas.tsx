"use client"

import { apiFetch } from "@/lib/base"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { BoardEdge, BoardItem, ItemStyle, User } from "@/lib/db"
import { initials } from "@/lib/links"
import { useLive } from "@/lib/useLive"
import {
  IconCard,
  IconConnect,
  IconLink,
  IconMinus,
  IconPlus,
  IconSticky,
  IconTarget,
  IconTrash,
} from "./Icons"
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconCursor,
  IconDiamond,
  IconDuplicate,
  IconEllipse,
  IconFit,
  IconEraser,
  IconPen,
  IconRedo,
  IconRound,
  IconShapes,
  IconSquare,
  IconText,
  IconTextStyle,
  IconTriangle,
  IconUndo,
} from "./ToolIcons"

type Tool = "select" | "card" | "sticky" | "text" | "shape" | "pen" | "link"

type Drag =
  | { kind: "pan"; startX: number; startY: number; panX: number; panY: number }
  | { kind: "marquee"; startX: number; startY: number }
  | {
      kind: "move"
      id: string
      startX: number
      startY: number
      itemX: number
      itemY: number
      moved?: boolean
    }
  | {
      kind: "resize"
      id: string
      startX: number
      startY: number
      w: number
      h: number
      moved?: boolean
    }
  | null

type Wire = { fromId: string; x: number; y: number; moved: boolean }
type Menu = { id: string; x: number; y: number }
type Step = { undo: () => void | Promise<void>; redo: () => void | Promise<void> }

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2
const GAP = 16

const SHAPES: Array<{ id: string; label: string; Icon: (p: { size?: number }) => JSX.Element }> = [
  { id: "rect", label: "Rectangle", Icon: IconSquare },
  { id: "round", label: "Rounded", Icon: IconRound },
  { id: "ellipse", label: "Ellipse", Icon: IconEllipse },
  { id: "diamond", label: "Diamond", Icon: IconDiamond },
  { id: "triangle", label: "Triangle", Icon: IconTriangle },
]

const FILLS = ["#FFFFFF", "#FFF6E5", "#E8F1FB", "#EAF6EE", "#F5ECFC", "#FDECEC", "#111110"]
const TEXT_COLORS = ["#111110", "#4A4844", "#FF6A00", "#2783DE", "#46A171", "#8B5CF6", "#FFFFFF"]

function shapePath(shape: string, style: ItemStyle) {
  if (shape === "freehand") return style.path || ""
  if (shape === "diamond") return "M50 2 L98 50 L50 98 L2 50 Z"
  if (shape === "triangle") return "M50 3 L98 97 L2 97 Z"
  return ""
}

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +z.toFixed(3)))
}

type Box = { x: number; y: number; width: number; height: number }

function hits(a: Box, b: Box) {
  return (
    a.x < b.x + b.width + GAP &&
    a.x + a.width + GAP > b.x &&
    a.y < b.y + b.height + GAP &&
    a.y + a.height + GAP > b.y
  )
}

/** Push a box to the closest free slot so cards never sit on top of each other. */
function freeSpot(box: Box, others: Box[]): Box {
  let candidate = { ...box }
  for (let pass = 0; pass < 80; pass++) {
    const clash = others.find((o) => hits(candidate, o))
    if (!clash) return candidate
    const right = clash.x + clash.width + GAP
    const below = clash.y + clash.height + GAP
    const dRight = right - candidate.x
    const dBelow = below - candidate.y
    if (dRight <= dBelow) candidate = { ...candidate, x: right }
    else candidate = { ...candidate, y: below }
  }
  return candidate
}

const TEXT_STYLES: Array<{ id: string; label: string; fontSize: number; fontWeight: number }> = [
  { id: "h1", label: "Large heading", fontSize: 26, fontWeight: 700 },
  { id: "h2", label: "Normal heading", fontSize: 19, fontWeight: 650 },
  { id: "body", label: "Normal text", fontSize: 14, fontWeight: 450 },
  { id: "small", label: "Small text", fontSize: 12, fontWeight: 450 },
]

const HIGHLIGHTS = [
  { id: "none", value: "" },
  { id: "yellow", value: "#FFF3C4" },
  { id: "green", value: "#D9F2E3" },
  { id: "blue", value: "#D9E8FA" },
  { id: "pink", value: "#FBD9E8" },
  { id: "purple", value: "#E8DCFB" },
]

function grow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = "auto"
  el.style.height = el.scrollHeight + "px"
}

/** The formatting rail that floats beside an open note. */
function NoteRail({
  item,
  onStyle,
}: {
  item: BoardItem
  onStyle: (patch: ItemStyle) => void
}) {
  const [open, setOpen] = useState(false)
  const style = (item.style || {}) as ItemStyle
  const size = style.fontSize || 14
  const active =
    TEXT_STYLES.find((s) => s.fontSize === size)?.id || "body"

  return (
    <div
      className="note-rail"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className={"rail-btn" + (open ? " on" : "")}
        title="Text style"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <IconTextStyle />
      </button>
      <button
        className={"rail-btn" + ((style.fontWeight || 450) >= 650 ? " on" : "")}
        title="Bold"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          onStyle({ fontWeight: (style.fontWeight || 450) >= 650 ? 450 : 700 })
        }
      >
        <b>B</b>
      </button>
      <button
        className={"rail-btn" + (style.italic ? " on" : "")}
        title="Italic"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onStyle({ italic: !style.italic })}
      >
        <i>I</i>
      </button>

      {open ? (
        <div className="style-menu">
          {TEXT_STYLES.map((s) => (
            <button
              key={s.id}
              className={"style-row" + (active === s.id ? " on" : "")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onStyle({ fontSize: s.fontSize, fontWeight: s.fontWeight })
                setOpen(false)
              }}
            >
              <span style={{ fontSize: Math.min(s.fontSize, 18), fontWeight: s.fontWeight }}>
                {s.label}
              </span>
              {active === s.id ? <span className="style-tick">✓</span> : null}
            </button>
          ))}
          <div className="style-sep" />
          <div className="style-label">Color</div>
          <div className="style-colors">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                className={"style-swatch" + ((style.color || "#111110") === c ? " on" : "")}
                style={{ color: c }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onStyle({ color: c })}
              >
                A
              </button>
            ))}
          </div>
          <div className="style-label">Highlight</div>
          <div className="style-colors">
            {HIGHLIGHTS.map((h) => (
              <button
                key={h.id}
                className={"style-swatch" + ((style.fill || "") === h.value ? " on" : "")}
                style={{ background: h.value || "#fff" }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onStyle({ fill: h.value })}
              >
                A
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** A note is just a text box: click it and type, exactly like Milanote. */
function NoteEditor({
  item,
  onSave,
  onClose,
}: {
  item: BoardItem
  onSave: (body: string) => void
  onClose: () => void
}) {
  const box = useRef<HTMLTextAreaElement | null>(null)
  const [body, setBody] = useState(item.body || "")

  useEffect(() => {
    grow(box.current)
    const node = box.current
    if (!node) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [])

  return (
    <textarea
      ref={box}
      className="note-input"
      value={body}
      style={{
        fontSize: (item.style as ItemStyle)?.fontSize || 14,
        fontWeight: (item.style as ItemStyle)?.fontWeight || 450,
        fontStyle: (item.style as ItemStyle)?.italic ? "italic" : "normal",
        color: (item.style as ItemStyle)?.color || "#111110",
      }}
      placeholder="Start typing…"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        setBody(e.target.value)
        grow(e.target as HTMLTextAreaElement)
        onSave(e.target.value)
      }}
      onBlur={() => onClose()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur()
      }}
    />
  )
}

function CardEditor({
  item,
  onSave,
  onCancel,
}: {
  item: BoardItem
  onSave: (patch: { title: string; body: string }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(item.title || "")
  const [body, setBody] = useState(item.body || "")
  const box = useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={box}
      className="item-editor"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        if (box.current && box.current.contains(e.relatedTarget as Node)) return
        onSave({ title, body })
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Escape") onCancel()
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave({ title, body })
      }}
    >
      <input
        className="edit-title"
        autoFocus
        value={title}
        placeholder="Start typing…"
        onChange={(e) => {
          setTitle(e.target.value)
          onSave({ title: e.target.value, body })
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            box.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus()
          }
        }}
      />
      <textarea
        className="edit-body"
        value={body}
        placeholder="Add a description…"
        onChange={(e) => {
          setBody(e.target.value)
          onSave({ title, body: e.target.value })
        }}
      />
    </div>
  )
}

export default function Canvas({
  boardId,
  me,
  users,
  initialItems,
  initialEdges,
}: {
  boardId: string
  me: User
  users: User[]
  initialItems: BoardItem[]
  initialEdges: BoardEdge[]
}) {
  const [items, setItems] = useState<BoardItem[]>(initialItems)
  const [edges, setEdges] = useState<BoardEdge[]>(initialEdges)
  const [pan, setPan] = useState({ x: 40, y: 30 })
  const [zoom, setZoom] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>("select")
  const [shapeKind, setShapeKind] = useState("round")
  const [shapeMenu, setShapeMenu] = useState(false)
  const [wire, setWire] = useState<Wire | null>(null)
  const [stroke, setStroke] = useState<{ x: number; y: number }[] | null>(null)
  const [ink, setInk] = useState("#111110")
  const [nib, setNib] = useState(3)
  const [erasing, setErasing] = useState(false)
  const [drawCount, setDrawCount] = useState(0)
  const inkRef = useRef(ink)
  const nibRef = useRef(nib)
  inkRef.current = ink
  nibRef.current = nib
  const [hoverEdge, setHoverEdge] = useState<string | null>(null)
  const [hoverTarget, setHoverTarget] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [marquee, setMarquee] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  const [panning, setPanning] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [linkPoint, setLinkPoint] = useState<{ x: number; y: number } | null>(null)
  const [dragTool, setDragTool] = useState<Tool | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const ghostRef = useRef<{ kind: Tool; x: number; y: number } | null>(null)
  const marqueeGhostRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [history, setHistory] = useState({ undo: 0, redo: 0 })

  const drag = useRef<Drag>(null)
  const wrap = useRef<HTMLDivElement | null>(null)
  const panRef = useRef(pan)
  const zoomRef = useRef(zoom)
  const wireRef = useRef<Wire | null>(null)
  const itemsRef = useRef(items)
  const pickedRef = useRef(picked)
  const marqueeRef = useRef(marquee)
  const spaceRef = useRef(false)
  const groupRef = useRef<Array<{ id: string; x: number; y: number }> | null>(null)
  panRef.current = pan
  zoomRef.current = zoom
  wireRef.current = wire
  itemsRef.current = items
  pickedRef.current = picked
  marqueeRef.current = marquee

  // --- Live collaboration -------------------------------------------------
  // Remote events only touch local state; they never call the save helpers,
  // so a change can never echo back and forth between two browsers.
  const onLive = useCallback((event: { type: string; senderId: string; payload?: unknown }) => {
    const data = event.payload as any
    if (event.type === "item.upsert") {
      if (data?.item) {
        const incoming = data.item as BoardItem
        setItems((prev) =>
          prev.some((i) => i.id === incoming.id)
            ? prev.map((i) => (i.id === incoming.id ? { ...i, ...incoming } : i))
            : [...prev, incoming],
        )
      } else if (data?.id) {
        setItems((prev) => prev.map((i) => (i.id === data.id ? { ...i, ...data.patch } : i)))
      }
      return
    }
    if (event.type === "item.remove" && data?.id) {
      setItems((prev) => prev.filter((i) => i.id !== data.id))
      setEdges((prev) => prev.filter((e) => e.from_item !== data.id && e.to_item !== data.id))
      return
    }
    if (event.type === "edge.add" && data?.edge) {
      const incoming = data.edge as BoardEdge
      setEdges((prev) => (prev.some((e) => e.id === incoming.id) ? prev : [...prev, incoming]))
      return
    }
    if (event.type === "edge.remove" && data?.id) {
      setEdges((prev) => prev.filter((e) => e.id !== data.id))
    }
  }, [])

  const live = useLive(boardId, me.id, onLive)
  const liveRef = useRef(live)
  liveRef.current = live

  // Tell teammates which card has this person's caret in it.
  useEffect(() => {
    live.send("editing", { itemId: editing })
  }, [editing, live])

  // Stream the pointer in board coordinates so it lands in the same spot
  // for everyone regardless of their own pan and zoom.
  useEffect(() => {
    const node = wrap.current
    if (!node) return
    const onMove = (e: PointerEvent) => {
      const box = node.getBoundingClientRect()
      const z = zoomRef.current || 1
      liveRef.current.sendCursor(
        (e.clientX - box.left - panRef.current.x) / z,
        (e.clientY - box.top - panRef.current.y) / z,
      )
    }
    node.addEventListener("pointermove", onMove)
    return () => node.removeEventListener("pointermove", onMove)
  }, [])
  marqueeGhostRef.current = ghost ? { x: ghost.x, y: ghost.y, w: ghost.w, h: ghost.h } : null
  const past = useRef<Step[]>([])
  const future = useRef<Step[]>([])

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const colorOf = (id: string) => userMap.get(id)?.color || "#8d8a84"
  const nameOf = (id: string) => userMap.get(id)?.display_name || "Another member"
  const ownedByMe = (item: { created_by: string }) => item.created_by === me.id
  const startEdit = (item: { id: string; created_by: string }) => {
    if (!ownedByMe(item)) {
      setToast(
        "You can't edit a teammate's card. " +
          nameOf(item.created_by) +
          " created this one, so only they can change the text. You can still move, resize and connect it.",
      )
      return
    }
    setEditing(item.id)
  }
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!menu) return
    function close() {
      setMenu(null)
    }
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [menu])

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.code === "Space") spaceRef.current = true
    }
    function up(e: KeyboardEvent) {
      if (e.code === "Space") spaceRef.current = false
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  const toBoard = useCallback((clientX: number, clientY: number) => {
    const rect = wrap.current?.getBoundingClientRect()
    return {
      x: (clientX - (rect?.left || 0) - panRef.current.x) / zoomRef.current,
      y: (clientY - (rect?.top || 0) - panRef.current.y) / zoomRef.current,
    }
  }, [])

  const zoomTo = useCallback((next: number, clientX?: number, clientY?: number) => {
    const rect = wrap.current?.getBoundingClientRect()
    const target = clampZoom(next)
    const prev = zoomRef.current
    if (target === prev) return
    const cx = (clientX ?? (rect ? rect.left + rect.width / 2 : 0)) - (rect?.left || 0)
    const cy = (clientY ?? (rect ? rect.top + rect.height / 2 : 0)) - (rect?.top || 0)
    const k = target / prev
    setPan({ x: cx - (cx - panRef.current.x) * k, y: cy - (cy - panRef.current.y) * k })
    setZoom(target)
  }, [])

  const zoomToFit = useCallback(() => {
    const rect = wrap.current?.getBoundingClientRect()
    if (!rect || items.length === 0) {
      setZoom(1)
      setPan({ x: 40, y: 30 })
      return
    }
    const minX = Math.min(...items.map((i) => i.x))
    const minY = Math.min(...items.map((i) => i.y))
    const maxX = Math.max(...items.map((i) => i.x + i.width))
    const maxY = Math.max(...items.map((i) => i.y + i.height))
    const pad = 80
    const next = clampZoom(
      Math.min(
        (rect.width - pad * 2) / (maxX - minX || 1),
        (rect.height - pad * 2) / (maxY - minY || 1),
      ),
    )
    setZoom(next)
    setPan({
      x: (rect.width - (maxX - minX) * next) / 2 - minX * next,
      y: (rect.height - (maxY - minY) * next) / 2 - minY * next,
    })
  }, [items])

  useEffect(() => {
    const node = wrap.current
    if (!node) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      // Ctrl / Cmd + scroll zooms at the cursor. A plain scroll pans the board.
      if (e.ctrlKey || e.metaKey) {
        zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.0035), e.clientX, e.clientY)
        return
      }
      if (e.shiftKey) {
        setPan((p) => ({ x: p.x - (e.deltaX || e.deltaY), y: p.y }))
        return
      }
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [zoomTo])

  const patchItem = useCallback(async (id: string, patch: Record<string, unknown>) => {
    const res = await apiFetch("/api/items", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    })
    if (!res.ok) setToast("Could not save that change")
    else liveRef.current?.send("item.upsert", { id, patch })
  }, [])

  const updateLocal = useCallback((id: string, patch: Partial<BoardItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  // Typing saves itself. The timer lives on the canvas, so closing the card
  // (or clicking the background) can never throw away what was typed.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueSave = useCallback(
    (id: string, patch: Partial<BoardItem>) => {
      updateLocal(id, patch)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        patchItem(id, patch as Record<string, unknown>)
      }, 400)
    },
    [patchItem, updateLocal],
  )

  const syncHistory = useCallback(() => {
    setHistory({ undo: past.current.length, redo: future.current.length })
  }, [])

  const pushStep = useCallback(
    (step: Step) => {
      past.current.push(step)
      if (past.current.length > 80) past.current.shift()
      future.current = []
      syncHistory()
    },
    [syncHistory],
  )

  const applyPatch = useCallback(
    (id: string, patch: Partial<BoardItem>) => {
      updateLocal(id, patch)
      patchItem(id, patch as Record<string, unknown>)
    },
    [patchItem, updateLocal],
  )

  const trackPatch = useCallback(
    (id: string, next: Partial<BoardItem>, prev: Partial<BoardItem>) => {
      pushStep({ undo: () => applyPatch(id, prev), redo: () => applyPatch(id, next) })
    },
    [applyPatch, pushStep],
  )

  const createRaw = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await apiFetch("/api/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId, ...payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.item) {
        setToast(data?.error || "Could not add that")
        return null
      }
      const item = data.item as BoardItem
      setItems((prev) => [...prev, item])
      setSelected(item.id)
      liveRef.current?.send("item.upsert", { item })
      return item
    },
    [boardId],
  )

  const dropLocal = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    setEdges((prev) => prev.filter((e) => e.from_item !== id && e.to_item !== id))
    setSelected((prev) => (prev === id ? null : prev))
    setEditing((prev) => (prev === id ? null : prev))
    liveRef.current?.send("item.remove", { id })
  }, [])

  /** Create an item and remember it so Undo can take it back. */
  const addItem = useCallback(
    async (payload: Record<string, unknown>) => {
      const item = await createRaw(payload)
      if (!item) return null
      const ref = { id: item.id }
      pushStep({
        undo: async () => {
          dropLocal(ref.id)
          await apiFetch("/api/items?id=" + ref.id, { method: "DELETE" })
        },
        redo: async () => {
          const again = await createRaw(payload)
          if (again) ref.id = again.id
        },
      })
      return item
    },
    [createRaw, dropLocal, pushStep],
  )

  const removeItem = useCallback(
    async (id: string) => {
      const snapshot = itemsRef.current.find((i) => i.id === id)
      if (snapshot && snapshot.created_by !== me.id) {
        setToast(
          "You can't delete a teammate's card. " +
            (userMap.get(snapshot.created_by)?.display_name || "Another member") +
            " created this one.",
        )
        return
      }
      dropLocal(id)
      setMenu(null)
      const res = await apiFetch("/api/items?id=" + id, { method: "DELETE" })
      if (!res.ok) {
        setToast("Could not delete that card")
        return
      }
      if (!snapshot) return
      const payload = {
        kind: snapshot.kind,
        shape: snapshot.shape,
        style: snapshot.style || {},
        title: snapshot.title || "",
        body: snapshot.body || "",
        linkUrl: snapshot.link_url || "",
        x: snapshot.x,
        y: snapshot.y,
        width: snapshot.width,
        height: snapshot.height,
      }
      const ref = { id }
      pushStep({
        undo: async () => {
          const again = await createRaw(payload)
          if (again) ref.id = again.id
        },
        redo: async () => {
          dropLocal(ref.id)
          await apiFetch("/api/items?id=" + ref.id, { method: "DELETE" })
        },
      })
    },
    [createRaw, dropLocal, pushStep, me.id, userMap],
  )

  /** Keep a box clear of every other card. */
  const resolve = useCallback((box: Box, ignoreId?: string) => {
    const others = itemsRef.current
      .filter((i) => i.id !== ignoreId)
      .map((i) => ({ x: i.x, y: i.y, width: i.width, height: i.height }))
    return freeSpot(box, others)
  }, [])

  const undo = useCallback(async () => {
    const step = past.current.pop()
    if (!step) {
      setToast("Nothing left to undo")
      return
    }
    await step.undo()
    future.current.push(step)
    syncHistory()
  }, [syncHistory])

  const redo = useCallback(async () => {
    const step = future.current.pop()
    if (!step) {
      setToast("Nothing to redo")
      return
    }
    await step.redo()
    past.current.push(step)
    syncHistory()
  }, [syncHistory])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault()
        zoomTo(zoomRef.current * 1.15)
        return
      }
      if (mod && e.key === "-") {
        e.preventDefault()
        zoomTo(zoomRef.current / 1.15)
        return
      }
      if (mod && e.key === "0") {
        e.preventDefault()
        zoomTo(1)
        return
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault()
        redo()
        return
      }
      if (typing) return
      if (e.key === "Delete" || e.key === "Backspace") {
        const many = pickedRef.current
        if (many.length > 1) {
          e.preventDefault()
          many.forEach((id) => removeItem(id))
          setPicked([])
          return
        }
        if (selected) {
          e.preventDefault()
          removeItem(selected)
          return
        }
      }
      if (e.key === "Escape") {
        setWire(null)
        setPicked([])
        setTool("select")
        setShapeMenu(false)
        setSelected(null)
        setMenu(null)
        return
      }
      if ((e.key === "Enter" || e.key === "F2") && selected && !editing) {
        e.preventDefault()
        setEditing(selected)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selected, editing, removeItem, zoomTo, undo, redo])

  const connect = useCallback(
    async (fromId: string, toId: string) => {
      if (fromId === toId) return
      const exists = edges.some(
        (e) =>
          (e.from_item === fromId && e.to_item === toId) ||
          (e.from_item === toId && e.to_item === fromId),
      )
      if (exists) {
        setToast("Those two are already connected")
        return
      }
      const temp: BoardEdge = {
        id: "tmp-" + fromId + toId,
        board_id: boardId,
        created_by: me.id,
        from_item: fromId,
        to_item: toId,
      }
      setEdges((prev) => [...prev, temp])
      const res = await apiFetch("/api/edges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId, fromItem: fromId, toItem: toId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.edge) {
        setEdges((prev) => prev.filter((e) => e.id !== temp.id))
        setToast(data?.error || "Could not create that connection")
        return
      }
      setEdges((prev) => prev.map((e) => (e.id === temp.id ? (data.edge as BoardEdge) : e)))
      liveRef.current?.send("edge.add", { edge: data.edge })
    },
    [boardId, edges, me.id],
  )

  async function removeEdge(id: string) {
    setEdges((prev) => prev.filter((e) => e.id !== id))
    setHoverEdge(null)
    liveRef.current?.send("edge.remove", { id })
    await apiFetch("/api/edges?id=" + id, { method: "DELETE" })
  }

  function anchors(a: BoardItem, b: BoardItem) {
    const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 }
    const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    const horizontal = Math.abs(bc.x - ac.x) >= Math.abs(bc.y - ac.y)
    if (horizontal) {
      const right = bc.x >= ac.x
      return {
        x1: right ? a.x + a.width : a.x,
        y1: ac.y,
        x2: right ? b.x : b.x + b.width,
        y2: bc.y,
        horizontal,
      }
    }
    const down = bc.y >= ac.y
    return {
      x1: ac.x,
      y1: down ? a.y + a.height : a.y,
      x2: bc.x,
      y2: down ? b.y : b.y + b.height,
      horizontal,
    }
  }

  function curve(x1: number, y1: number, x2: number, y2: number, horizontal: boolean) {
    const d = Math.max(36, Math.abs(horizontal ? x2 - x1 : y2 - y1) * 0.45)
    return horizontal
      ? "M" + x1 + " " + y1 + " C" + (x1 + d) + " " + y1 + " " + (x2 - d) + " " + y2 + " " + x2 + " " + y2
      : "M" + x1 + " " + y1 + " C" + x1 + " " + (y1 + d) + " " + x2 + " " + (y2 - d) + " " + x2 + " " + y2
  }

  const placeItem = useCallback(
    (
      kind: Tool,
      point: { x: number; y: number },
      linkUrl?: string,
      size?: { width: number; height: number },
    ) => {
      const isText = kind === "text"
      const isShape = kind === "shape"
      const width = size ? Math.max(120, Math.round(size.width)) : isText ? 260 : isShape ? 200 : 240
      const height = size ? Math.max(56, Math.round(size.height)) : isText ? 64 : isShape ? 150 : 150
      const spot = resolve({
        x: Math.round(point.x - width / 2),
        y: Math.round(point.y - height / 2),
        width,
        height,
      })
      const payload: Record<string, unknown> = {
        kind: kind === "link" ? "link" : kind,
        shape: isShape ? shapeKind : "none",
        x: Math.round(spot.x),
        y: Math.round(spot.y),
        width,
        height,
        title: "",
        body: "",
        style: isText
          ? { fontSize: 22, fontWeight: 600, align: "left", color: "#111110" }
          : isShape
            ? {
                fill: "#FFFFFF",
                stroke: me.color,
                fontSize: 15,
                fontWeight: 500,
                align: "center",
                color: "#111110",
              }
            : {},
      }
      if (linkUrl) payload.linkUrl = linkUrl
      addItem(payload).then((item) => {
        if (item && kind !== "link") startEdit(item)
      })
    },
    [addItem, me.color, resolve, shapeKind],
  )

  /** Upload one image file and place it on the board. */
  const addImageFile = useCallback(
    async (file: File, at: { x: number; y: number }) => {
      setToast("Uploading image…")
      const dataUrl = await new Promise<string>((done) => {
        const reader = new FileReader()
        reader.onload = () => done(String(reader.result || ""))
        reader.onerror = () => done("")
        reader.readAsDataURL(file)
      })
      if (!dataUrl) {
        setToast("Could not read that image")
        return
      }
      const res = await apiFetch("/api/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) {
        setToast(data?.error || "Could not upload that image")
        return
      }
      const width = 300
      const height = 220
      const spot = resolve({
        x: Math.round(at.x - width / 2),
        y: Math.round(at.y - height / 2),
        width,
        height,
      })
      await addItem({
        kind: "image",
        shape: "none",
        title: "",
        body: "",
        linkUrl: data.url,
        x: Math.round(spot.x),
        y: Math.round(spot.y),
        width,
        height,
        style: {},
      })
      setToast("Image added")
    },
    [addItem, resolve],
  )

  /** Paste an image file or a link straight onto the canvas. */
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return
      }
      const rect = wrap.current?.getBoundingClientRect()
      if (!rect) return
      const center = toBoard(rect.left + rect.width / 2, rect.top + rect.height / 2)
      const clip = e.clipboardData
      if (!clip) return
      const files = Array.from(clip.files || [])
      const entries = Array.from(clip.items || [])
      const picture =
        files.find((f) => f.type.startsWith("image/")) ||
        entries
          .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
          .map((it) => it.getAsFile())
          .find((f): f is File => !!f)

      if (picture) {
        e.preventDefault()
        await addImageFile(picture, center)
        return
      }

      const text = (clip.getData("text/plain") || "").trim()
      if (text && /^https?:/i.test(text) && !text.includes(" ")) {
        e.preventDefault()
        placeItem("link", center, text)
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [addImageFile, placeItem, toBoard])

  function onWrapPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return
    setMenu(null)
    const point = toBoard(e.clientX, e.clientY)

    if (tool === "pen") {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      setStroke([point])
      return
    }

    if (tool !== "select") {
      if (tool === "link") {
        setTool("select")
        setLinkPoint(point)
        return
      }
      // Drag out the size you want; a plain click uses the default size.
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      ghostRef.current = { kind: tool, x: e.clientX, y: e.clientY }
      setGhost({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
      return
    }

    setSelected(null)
    setEditing(null)
    setWire(null)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (e.altKey || spaceRef.current || e.button === 1) {
      drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
      setPanning(true)
      return
    }
    setPicked([])
    drag.current = { kind: "marquee", startX: e.clientX, startY: e.clientY }
    setMarquee({ x1: point.x, y1: point.y, x2: point.x, y2: point.y })
  }

  function onWrapPointerMove(e: React.PointerEvent) {
    if (stroke) {
      const point = toBoard(e.clientX, e.clientY)
      setStroke((prev) => (prev ? [...prev, point] : prev))
      return
    }
    if (ghostRef.current) {
      const g = ghostRef.current
      setGhost({
        x: Math.min(g.x, e.clientX),
        y: Math.min(g.y, e.clientY),
        w: Math.abs(e.clientX - g.x),
        h: Math.abs(e.clientY - g.y),
      })
      return
    }
    if (wireRef.current) {
      const point = toBoard(e.clientX, e.clientY)
      setWire((prev) => (prev ? { ...prev, x: point.x, y: point.y, moved: true } : prev))
    }
    const d = drag.current
    if (!d) return
    if (d.kind === "pan") {
      setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) })
      return
    }
    if (d.kind === "marquee") {
      const from = toBoard(d.startX, d.startY)
      const to = toBoard(e.clientX, e.clientY)
      setMarquee({ x1: from.x, y1: from.y, x2: to.x, y2: to.y })
      // Live feedback: everything the box currently covers lights up as you
      // drag, instead of only highlighting once the mouse is released.
      const left = Math.min(from.x, to.x)
      const right = Math.max(from.x, to.x)
      const top = Math.min(from.y, to.y)
      const bottom = Math.max(from.y, to.y)
      const inside = itemsRef.current
        .filter((i) => i.x < right && i.x + i.width > left && i.y < bottom && i.y + i.height > top)
        .map((i) => i.id)
      setPicked((prev) =>
        prev.length === inside.length && prev.every((id, n) => id === inside[n]) ? prev : inside,
      )
      return
    }
    const dx = (e.clientX - d.startX) / zoomRef.current
    const dy = (e.clientY - d.startY) / zoomRef.current
    if (Math.abs(e.clientX - d.startX) > 3 || Math.abs(e.clientY - d.startY) > 3) d.moved = true
    if (!d.moved) return
    if (d.kind === "move") {
      const group = groupRef.current
      if (group && group.length > 1) {
        group.forEach((g) => {
          updateLocal(g.id, { x: Math.round(g.x + dx), y: Math.round(g.y + dy) })
        })
      } else {
        updateLocal(d.id, { x: Math.round(d.itemX + dx), y: Math.round(d.itemY + dy) })
      }
    } else {
      updateLocal(d.id, {
        width: Math.max(120, Math.round(d.w + dx)),
        height: Math.max(56, Math.round(d.h + dy)),
      })
    }
  }

  async function onWrapPointerUp() {
    if (stroke) {
      const points = stroke
      setStroke(null)
      if (points.length > 3) await commitStroke(points)
      return
    }
    const g = ghostRef.current
    if (g) {
      const box = marqueeGhostRef.current
      ghostRef.current = null
      setGhost(null)
      setTool("select")
      const big = box && box.w > 24 && box.h > 24
      const centre = big
        ? toBoard(box.x + box.w / 2, box.y + box.h / 2)
        : toBoard(g.x, g.y)
      placeItem(
        g.kind,
        centre,
        undefined,
        big ? { width: box.w / zoomRef.current, height: box.h / zoomRef.current } : undefined,
      )
      return
    }
    const d = drag.current
    drag.current = null
    setPanning(false)
    if (d && d.kind === "marquee") {
      const box = marqueeRef.current
      setMarquee(null)
      if (box) {
        const left = Math.min(box.x1, box.x2)
        const right = Math.max(box.x1, box.x2)
        const top = Math.min(box.y1, box.y2)
        const bottom = Math.max(box.y1, box.y2)
        if (right - left > 6 || bottom - top > 6) {
          const inside = itemsRef.current
            .filter(
              (i) =>
                i.x < right && i.x + i.width > left && i.y < bottom && i.y + i.height > top,
            )
            .map((i) => i.id)
          setPicked(inside)
          if (inside.length === 1) setSelected(inside[0])
        }
      }
      return
    }
    if (d && (d.kind === "move" || d.kind === "resize")) {
      const group = groupRef.current
      groupRef.current = null
      if (d.kind === "move" && d.moved && group && group.length > 1) {
        const after: Array<{ id: string; x: number; y: number }> = []
        for (const g of group) {
          const moved = itemsRef.current.find((i) => i.id === g.id)
          if (moved) {
            after.push({ id: moved.id, x: moved.x, y: moved.y })
            await patchItem(moved.id, { x: moved.x, y: moved.y })
          }
        }
        // One step for the whole group, so undo puts them all back at once.
        const before = group.map((g) => ({ id: g.id, x: g.x, y: g.y }))
        const place = (list: Array<{ id: string; x: number; y: number }>) => {
          for (const entry of list) applyPatch(entry.id, { x: entry.x, y: entry.y })
        }
        pushStep({ undo: () => place(before), redo: () => place(after) })
        if (wireRef.current?.moved) setWire(null)
        return
      }
    }
    if (d && (d.kind === "move" || d.kind === "resize")) {
      const item = itemsRef.current.find((i) => i.id === d.id)
      if (item && d.kind === "move" && !d.moved) {
        // A single click on a card opens its inputs, Milanote style.
        if (item.kind !== "image") startEdit(item)
      } else if (item) {
        // Overlap is allowed on purpose: a card is dropped exactly where it
        // was released, so text can sit on top of anything.
        const next = {
          x: Math.round(item.x),
          y: Math.round(item.y),
          width: item.width,
          height: item.height,
        }
        const prev =
          d.kind === "move"
            ? { x: d.itemX, y: d.itemY, width: item.width, height: item.height }
            : { x: item.x, y: item.y, width: d.w, height: d.h }
        updateLocal(item.id, next)
        await patchItem(item.id, next)
        trackPatch(item.id, next, prev)
      }
    }
    if (wireRef.current?.moved) setWire(null)
  }

  async function commitStroke(points: { x: number; y: number }[]) {
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const w = Math.max(60, maxX - minX)
    const h = Math.max(60, maxY - minY)
    const path = points
      .map((p, i) => {
        const nx = ((p.x - minX) / w) * 100
        const ny = ((p.y - minY) / h) * 100
        return (i === 0 ? "M" : "L") + nx.toFixed(2) + " " + ny.toFixed(2)
      })
      .join(" ")
    await addItem({
      kind: "shape",
      shape: "freehand",
      x: Math.round(minX - 8),
      y: Math.round(minY - 8),
      width: Math.round(w + 16),
      height: Math.round(h + 16),
      title: "",
      body: "",
      style: {
        fill: "none",
        stroke: inkRef.current,
        strokeWidth: nibRef.current,
        fontSize: 15,
        fontWeight: 500,
        align: "center",
        color: "#111110",
        path,
      },
    })
    setDrawCount((n) => n + 1)
  }

  function startMove(e: React.PointerEvent, item: BoardItem) {
    if (tool !== "select" || editing === item.id) return
    setSelected(item.id)
    const chosen = pickedRef.current.includes(item.id) ? pickedRef.current : []
    if (chosen.length < 2) setPicked([])
    groupRef.current = (chosen.length > 1 ? chosen : [item.id])
      .map((id) => itemsRef.current.find((i) => i.id === id))
      .filter((i): i is BoardItem => !!i)
      .map((i) => ({ id: i.id, x: i.x, y: i.y }))
    drag.current = {
      kind: "move",
      id: item.id,
      startX: e.clientX,
      startY: e.clientY,
      itemX: item.x,
      itemY: item.y,
    }
  }

  function setStyle(item: BoardItem, patch: ItemStyle) {
    const style = { ...(item.style || {}), ...patch }
    const before = { ...(item.style || {}) }
    updateLocal(item.id, { style })
    patchItem(item.id, { style })
    trackPatch(item.id, { style }, { style: before })
  }

  function duplicate(item: BoardItem) {
    const spot = resolve({
      x: item.x + 26,
      y: item.y + 26,
      width: item.width,
      height: item.height,
    })
    addItem({
      kind: item.kind,
      shape: item.shape,
      style: item.style || {},
      title: item.title || "",
      body: item.body || "",
      linkUrl: item.link_url || "",
      x: Math.round(spot.x),
      y: Math.round(spot.y),
      width: item.width,
      height: item.height,
    })
  }

  function startWire(item: BoardItem) {
    setSelected(item.id)
    setWire({
      fromId: item.id,
      x: item.x + item.width / 2,
      y: item.y + item.height / 2,
      moved: false,
    })
  }

  function tidyBoard() {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
    const placed: Box[] = []
    sorted.forEach((item) => {
      const spot = freeSpot({ x: item.x, y: item.y, width: item.width, height: item.height }, placed)
      placed.push(spot)
      if (spot.x !== item.x || spot.y !== item.y) {
        updateLocal(item.id, { x: Math.round(spot.x), y: Math.round(spot.y) })
        patchItem(item.id, { x: Math.round(spot.x), y: Math.round(spot.y) })
      }
    })
    setToast("Cleaned up overlapping cards")
  }

  const strokePath = stroke
    ? stroke.map((p, i) => (i === 0 ? "M" : "L") + p.x + " " + p.y).join(" ")
    : null
  const wireFrom = wire ? itemById.get(wire.fromId) : null
  const selectedRecord = selected ? itemById.get(selected) || null : null
  const menuItem = menu ? itemById.get(menu.id) || null : null

  return (
    <div
      ref={wrap}
      className={
        "canvas-wrap" +
        (panning ? " panning" : "") +
        (tool !== "select" ? " placing" : "") +
        (tool === "pen" ? " drawing" : "") +
        (tool === "pen" && erasing ? " erasing" : "") +
        (wire ? " linking" : "")
      }
      onPointerDown={onWrapPointerDown}
      onPointerMove={onWrapPointerMove}
      onPointerUp={onWrapPointerUp}
      onPointerCancel={onWrapPointerUp}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
      }}
      onDrop={(e) => {
        const dropped = e.dataTransfer?.getData("text/ohq-tool") || ""
        if (dropped) {
          e.preventDefault()
          const at = toBoard(e.clientX, e.clientY)
          setTool("select")
          setDragTool(null)
          if (dropped === "link") setLinkPoint(at)
          else placeItem(dropped as Tool, { x: at.x - 120, y: at.y - 60 })
          return
        }
        const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
          f.type.startsWith("image/"),
        )
        if (files.length === 0) return
        e.preventDefault()
        const point = toBoard(e.clientX, e.clientY)
        files.forEach((f, i) => addImageFile(f, { x: point.x + i * 24, y: point.y + i * 24 }))
      }}
      onContextMenu={(e) => {
        if (!(e.target as HTMLElement).closest(".item")) return
        e.preventDefault()
      }}
      onDoubleClick={(e) => {
        if (tool !== "select" || (e.target as HTMLElement).closest(".item")) return
        placeItem("card", toBoard(e.clientX, e.clientY))
      }}
    >
      <div
        className="canvas-layer"
        style={{ transform: "translate(" + pan.x + "px," + pan.y + "px) scale(" + zoom + ")" }}
      >
        {live.cursors.map((c) => (
          <div
            key={c.userId}
            className="live-cursor"
            style={{ transform: "translate(" + c.x + "px," + c.y + "px)" }}
          >
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path d="M2 1.5 L12.5 8 L7.6 8.6 L5.4 13 Z" fill={colorOf(c.userId)} stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
            </svg>
            <span className="live-name" style={{ background: colorOf(c.userId) }}>
              {nameOf(c.userId)}
            </span>
          </div>
        ))}
        {live.peers
          .filter((p) => p.editing && p.userId !== me.id)
          .map((p) => {
            const target = items.find((i) => i.id === p.editing)
            if (!target) return null
            return (
              <div
                key={"edit-" + p.userId}
                className="live-editing"
                style={{
                  transform: "translate(" + target.x + "px," + (target.y - 26) + "px)",
                  background: colorOf(p.userId),
                }}
              >
                {nameOf(p.userId)} is editing
              </div>
            )
          })}
        <svg className="canvas-svg" overflow="visible">
          <defs>
            {users.map((u) => (
              <marker
                key={u.id}
                id={"arrow-" + u.id}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0 1 L9 5 L0 9 z" fill={u.color} />
              </marker>
            ))}
          </defs>

          {edges.map((edge) => {
            const a = itemById.get(edge.from_item)
            const b = itemById.get(edge.to_item)
            if (!a || !b) return null
            const { x1, y1, x2, y2, horizontal } = anchors(a, b)
            const d = curve(x1, y1, x2, y2, horizontal)
            const on = hoverEdge === edge.id
            return (
              <g key={edge.id}>
                <path
                  className={"edge-path" + (on ? " on" : "")}
                  d={d}
                  stroke={colorOf(edge.created_by)}
                  markerEnd={"url(#arrow-" + edge.created_by + ")"}
                />
                <path
                  className="edge-hit"
                  d={d}
                  onPointerEnter={() => setHoverEdge(edge.id)}
                  onPointerLeave={() => setHoverEdge(null)}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    removeEdge(edge.id)
                  }}
                />
                {on ? (
                  <g
                    className="edge-x"
                    transform={"translate(" + (x1 + x2) / 2 + "," + (y1 + y2) / 2 + ")"}
                  >
                    <circle r="10" fill="#111110" />
                    <path
                      d="M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5"
                      stroke="#fff"
                      strokeWidth="1.6"
                    />
                  </g>
                ) : null}
              </g>
            )
          })}

          {wire && wireFrom ? (
            <path
              className="edge-live"
              stroke={me.color}
              d={curve(
                wireFrom.x + wireFrom.width,
                wireFrom.y + 16,
                wire.x,
                wire.y,
                Math.abs(wire.x - (wireFrom.x + wireFrom.width / 2)) >=
                  Math.abs(wire.y - (wireFrom.y + wireFrom.height / 2)),
              )}
            />
          ) : null}

          {strokePath ? (
            <path
              className="edge-live"
              stroke={ink}
              strokeWidth={nib}
              strokeLinecap="round"
              strokeLinejoin="round"
              d={strokePath}
              fill="none"
            />
          ) : null}

          {marquee ? (
            <rect
              className="marquee"
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
            />
          ) : null}
        </svg>

        {items.map((item) => {
          const author = userMap.get(item.created_by)
          const style = (item.style || {}) as ItemStyle
          const isShape = item.kind === "shape"
          const isText = item.kind === "text"
          const isPlain = !isShape && !isText
          const path = isShape ? shapePath(item.shape, style) : ""
          const isTarget = hoverTarget === item.id && wire && wire.fromId !== item.id
          const isSelected = selected === item.id
          const isEditing = editing === item.id
          const dark = isPlain && style.fill === "#111110"

          return (
            <div
              key={item.id}
              className={
                "item " +
                item.kind +
                (item.shape === "freehand" ? " freehand" : "") +
                (isSelected ? " selected" : "") +
                (picked.includes(item.id) ? " picked" : "") +
                (isTarget ? " target" : "") +
                (isEditing ? " editing" : "") +
                (dark ? " dark" : "")
              }
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
                // Text floats above other cards, and whatever you are working
                // on floats above everything, so overlapping stays usable.
                zIndex: isEditing ? 40 : isSelected ? 30 : isText ? 20 : 1,
                ...((isPlain || item.kind === "sticky") && style.fill
                  ? { background: style.fill }
                  : {}),
              }}
              onPointerDown={(e) => {
                e.stopPropagation()
                setMenu(null)
                if (tool === "pen" && erasing) {
                  removeItem(item.id)
                  return
                }
                if (wire && wire.fromId !== item.id) {
                  connect(wire.fromId, item.id)
                  setWire(null)
                  return
                }
                startMove(e, item)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setSelected(item.id)
                setMenu({ id: item.id, x: e.clientX, y: e.clientY })
              }}
              onPointerEnter={() => setHoverTarget(item.id)}
              onPointerLeave={() => setHoverTarget((prev) => (prev === item.id ? null : prev))}
              onPointerUp={(e) => {
                if (wireRef.current && wireRef.current.fromId !== item.id) {
                  e.stopPropagation()
                  connect(wireRef.current.fromId, item.id)
                  setWire(null)
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setSelected(item.id)
                startEdit(item)
              }}
            >
              {isShape ? (
                <svg className="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {item.shape === "ellipse" ? (
                    <ellipse
                      cx="50"
                      cy="50"
                      rx="49"
                      ry="49"
                      fill={style.fill || "#fff"}
                      stroke={style.stroke || author?.color || "#111"}
                      vectorEffect="non-scaling-stroke"
                      strokeWidth="1.6"
                    />
                  ) : item.shape === "rect" || item.shape === "round" ? (
                    <rect
                      x="0.8"
                      y="0.8"
                      width="98.4"
                      height="98.4"
                      rx={item.shape === "round" ? 6 : 0}
                      fill={style.fill || "#fff"}
                      stroke={style.stroke || author?.color || "#111"}
                      vectorEffect="non-scaling-stroke"
                      strokeWidth="1.6"
                    />
                  ) : (
                    <path
                      d={path}
                      fill={
                        item.shape === "freehand"
                          ? "none"
                          : style.fill === "none"
                            ? "none"
                            : style.fill || "#fff"
                      }
                      stroke={style.stroke || author?.color || "#111"}
                      vectorEffect="non-scaling-stroke"
                      strokeWidth={
                        item.shape === "freehand" ? style.strokeWidth || 3 : 1.8
                      }
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              ) : null}

              {isEditing && item.kind === "sticky" ? (
                <NoteRail
                  item={item}
                  onStyle={(patch) => setStyle(item, patch)}
                />
              ) : null}
              {isEditing && item.kind === "sticky" ? (
                <NoteEditor
                  item={item}
                  onClose={() => setEditing(null)}
                  onSave={(body) => queueSave(item.id, { body })}
                />
              ) : isEditing && isPlain ? (
                <CardEditor
                  item={item}
                  onCancel={() => setEditing(null)}
                  onSave={({ title, body }) => queueSave(item.id, { title, body })}
                />
              ) : isEditing ? (
                <textarea
                  className={"item-edit" + (isText ? " text" : "")}
                  autoFocus
                  defaultValue={item.body || ""}
                  placeholder={isText ? "Type anything…" : "Write here…"}
                  style={{
                    fontSize: style.fontSize || (isText ? 22 : 15),
                    fontWeight: style.fontWeight || (isText ? 600 : 500),
                    textAlign: style.align || (isText ? "left" : "center"),
                    color: style.color || "#111110",
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => queueSave(item.id, { body: e.target.value })}
                  onBlur={(e) => {
                    queueSave(item.id, { body: e.target.value })
                    setEditing(null)
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur()
                  }}
                />
              ) : item.kind === "sticky" ? (
                <div
                  className="note-text"
                  style={{
                    fontSize: style.fontSize || 14,
                    fontWeight: style.fontWeight || 450,
                    fontStyle: style.italic ? "italic" : "normal",
                    color: style.color || "#111110",
                  }}
                >
                  {item.body || <span className="item-hint">Start typing…</span>}
                </div>
              ) : isPlain ? (
                <>
                  <div className="item-top">
                    <button
                      className="item-title as-button"
                      title="Click to rename"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelected(item.id)
                        startEdit(item)
                      }}
                    >
                      {item.title || <span className="item-hint">Untitled — click to name</span>}
                    </button>
                  </div>
                  {item.link_thumbnail ? (
                    <img
                      className={"item-thumb" + (item.kind === "image" ? " full" : "")}
                      src={item.link_thumbnail}
                      alt=""
                    />
                  ) : null}
                  {item.link_url && item.kind !== "image" ? (
                    <a
                      className="item-body item-linkline"
                      href={item.link_url}
                      target="_blank"
                      rel="noreferrer"
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <IconLink /> {item.link_url}
                    </a>
                  ) : item.body ? (
                    <div className="item-body">{item.body}</div>
                  ) : null}
                </>
              ) : (
                <div
                  className={"item-text" + (isShape ? " in-shape" : "")}
                  style={{
                    fontSize: style.fontSize || (isText ? 22 : 15),
                    fontWeight: style.fontWeight || (isText ? 600 : 500),
                    textAlign: style.align || (isText ? "left" : "center"),
                    color: style.color || "#111110",
                  }}
                >
                  {item.body ||
                    (item.shape === "freehand" ? null : (
                      <span className="item-hint">Double-click to write</span>
                    ))}
                </div>
              )}

              {isText ? null : (
                <div className="item-foot">
                  <span className="avatar sm" style={{ background: author?.color || "#8d8a84" }}>
                    {initials(author?.display_name || "?")}
                  </span>
                  <span>{author?.display_name || "Unknown"}</span>
                </div>
              )}

              {/* Hover connector: one handle in the top-right corner, plus a labelled button */}
              <button
                className={"item-handle" + (wire?.fromId === item.id ? " armed" : "")}
                style={{ background: author?.color || "#111110" }}
                title="Drag to another card to connect"
                aria-label="Connect from this card"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  const point = toBoard(e.clientX, e.clientY)
                  setSelected(item.id)
                  setWire({ fromId: item.id, x: point.x, y: point.y, moved: false })
                }}
                onClick={(e) => e.stopPropagation()}
              />

              {(isSelected || hoverTarget === item.id) && !isEditing && !wire ? (
                <div
                  className="item-bar"
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <button className="bar-btn" title="Edit text" onClick={() => startEdit(item)}>
                    <IconText size={15} />
                  </button>
                  <button className="bar-btn" title="Connect to another card" onClick={() => startWire(item)}>
                    <IconConnect size={15} />
                  </button>
                  <button className="bar-btn" title="Duplicate" onClick={() => duplicate(item)}>
                    <IconDuplicate size={15} />
                  </button>
                  <button className="bar-btn danger" title="Delete card" onClick={() => removeItem(item.id)}>
                    <IconTrash size={15} />
                  </button>
                </div>
              ) : null}

              <div
                className="item-resize"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setSelected(item.id)
                  drag.current = {
                    kind: "resize",
                    id: item.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    w: item.width,
                    h: item.height,
                  }
                }}
              />
            </div>
          )
        })}
      </div>

      {menu && menuItem ? (
        <div
          className="ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            className="ctx-item"
            onClick={() => {
              startEdit(menuItem)
              setMenu(null)
            }}
          >
            Rename / edit
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              startWire(menuItem)
              setMenu(null)
            }}
          >
            Connect with a line
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              duplicate(menuItem)
              setMenu(null)
            }}
          >
            Duplicate
          </button>
          <div className="ctx-label">Card colour</div>
          <div className="ctx-colors">
            {FILLS.map((c) => (
              <button
                key={c}
                className="insp-swatch"
                style={{ background: c }}
                aria-label={"Card colour " + c}
                onClick={() => {
                  setStyle(menuItem, { fill: c })
                  setMenu(null)
                }}
              />
            ))}
          </div>
          <div className="ctx-sep" />
          <button
            className="ctx-item danger"
            onClick={() => {
              removeItem(menuItem.id)
            }}
          >
            Delete
          </button>
        </div>
      ) : null}

      {ghost && ghost.w > 6 && ghost.h > 6 ? (
        <div
          className="place-ghost"
          style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }}
        />
      ) : null}

      {linkPoint ? (
        <div
          className="link-draft"
          style={{
            left: pan.x + linkPoint.x * zoom - 140,
            top: pan.y + linkPoint.y * zoom - 22,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <IconLink />
          <input
            className="link-draft-input"
            autoFocus
            placeholder="Enter a link URL"
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === "Escape") setLinkPoint(null)
              if (e.key === "Enter") {
                const url = (e.target as HTMLInputElement).value.trim()
                const point = linkPoint
                setLinkPoint(null)
                if (url) placeItem("link", point, url)
              }
            }}
            onBlur={(e) => {
              const url = e.target.value.trim()
              const point = linkPoint
              setLinkPoint(null)
              if (url) placeItem("link", point, url)
            }}
          />
        </div>
      ) : null}

      <div className="canvas-hud">
        <div className="hud-card">
          {items.length} {items.length === 1 ? "card" : "cards"}
        </div>
        {wire ? (
          <div className="linking-note">
            Drop on a card to connect — or click the target card. Esc cancels
          </div>
        ) : null}
        {tool === "pen" ? (
          <div className="draw-bar" onPointerDown={(e) => e.stopPropagation()}>
            <button
              className={"draw-tool" + (!erasing ? " on" : "")}
              title="Pen"
              onClick={() => setErasing(false)}
            >
              <IconPen size={16} />
            </button>
            <button
              className={"draw-tool" + (erasing ? " on" : "")}
              title="Eraser"
              onClick={() => setErasing(true)}
            >
              <IconEraser size={16} />
            </button>

            <span className="draw-sep" />

            <div className="draw-inks">
              {["#111110", "#FF6A00", "#2783DE", "#46A171", "#8B5CF6", "#E56458"].map((c) => (
                <button
                  key={c}
                  className={"draw-ink" + (ink === c && !erasing ? " on" : "")}
                  style={{ background: c }}
                  title="Ink colour"
                  onClick={() => {
                    setInk(c)
                    setErasing(false)
                  }}
                />
              ))}
            </div>

            <span className="draw-sep" />

            <div className="draw-nibs">
              {[2, 3, 5, 8].map((w) => (
                <button
                  key={w}
                  className={"draw-nib" + (nib === w ? " on" : "")}
                  title={w + "px"}
                  onClick={() => {
                    setNib(w)
                    setErasing(false)
                  }}
                >
                  <span style={{ width: w + 4, height: w + 4 }} />
                </button>
              ))}
            </div>

            <span className="draw-sep" />

            <button
              className="draw-text"
              disabled={drawCount === 0}
              onClick={async () => {
                for (let i = 0; i < drawCount; i++) await undo()
                setDrawCount(0)
              }}
            >
              Discard
            </button>
            <button
              className="draw-save"
              onClick={() => {
                setDrawCount(0)
                setErasing(false)
                setTool("select")
              }}
            >
              Save
            </button>
          </div>
        ) : null}
        {tool !== "select" && tool !== "pen" ? (
          <div className="place-tip">Click, or drag out the size you want</div>
        ) : null}
        {picked.length > 1 ? (
          <button
            className="hud-card danger"
            onClick={() => {
              picked.forEach((id) => removeItem(id))
              setPicked([])
            }}
          >
            Delete {picked.length} selected
          </button>
        ) : null}
        {!selected && picked.length === 0 && tool === "select" && !wire ? (
          <div className="hud-card ghost">Drag to select · Ctrl + scroll to zoom</div>
        ) : null}
        {toast ? (
          <div className="board-toast" role="status">
            <span className="board-toast-dot" />
            <span>{toast}</span>
          </div>
        ) : null}
      </div>

      {selectedRecord && (selectedRecord.kind === "shape" || selectedRecord.kind === "text") ? (
        <div
          className="inspector"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          {(() => {
            const item = selectedRecord
            const style = (item.style || {}) as ItemStyle
            const isText = item.kind === "text"
            const size = style.fontSize || (isText ? 22 : 15)
            return (
              <>
                <div className="insp-row">
                  <span className="insp-label">Size</span>
                  <div className="insp-group">
                    <button
                      className="dock-btn sm"
                      aria-label="Smaller text"
                      onClick={() => setStyle(item, { fontSize: Math.max(10, size - 2) })}
                    >
                      <IconMinus />
                    </button>
                    <span className="insp-value">{size}</span>
                    <button
                      className="dock-btn sm"
                      aria-label="Bigger text"
                      onClick={() => setStyle(item, { fontSize: Math.min(96, size + 2) })}
                    >
                      <IconPlus />
                    </button>
                    <button
                      className={"dock-btn sm" + ((style.fontWeight || 500) >= 700 ? " on" : "")}
                      aria-label="Bold"
                      onClick={() =>
                        setStyle(item, {
                          fontWeight: (style.fontWeight || 500) >= 700 ? 500 : 800,
                        })
                      }
                    >
                      <b style={{ fontSize: 13 }}>B</b>
                    </button>
                  </div>
                </div>

                <div className="insp-row">
                  <span className="insp-label">Align</span>
                  <div className="insp-group">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button
                        key={a}
                        className={
                          "dock-btn sm" +
                          ((style.align || (isText ? "left" : "center")) === a ? " on" : "")
                        }
                        aria-label={"Align " + a}
                        onClick={() => setStyle(item, { align: a })}
                      >
                        {a === "left" ? (
                          <IconAlignLeft />
                        ) : a === "center" ? (
                          <IconAlignCenter />
                        ) : (
                          <IconAlignRight />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="insp-row">
                  <span className="insp-label">Text</span>
                  <div className="insp-group">
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c}
                        className={"insp-swatch" + ((style.color || "#111110") === c ? " on" : "")}
                        style={{ background: c }}
                        aria-label={"Text color " + c}
                        onClick={() => setStyle(item, { color: c })}
                      />
                    ))}
                  </div>
                </div>

                {item.kind === "shape" ? (
                  <>
                    <div className="insp-row">
                      <span className="insp-label">Fill</span>
                      <div className="insp-group">
                        {FILLS.map((c) => (
                          <button
                            key={c}
                            className={"insp-swatch" + ((style.fill || "#FFFFFF") === c ? " on" : "")}
                            style={{ background: c }}
                            aria-label={"Fill " + c}
                            onClick={() => setStyle(item, { fill: c })}
                          />
                        ))}
                      </div>
                    </div>
                    {item.shape !== "freehand" ? (
                      <div className="insp-row">
                        <span className="insp-label">Shape</span>
                        <div className="insp-group">
                          {SHAPES.map(({ id, label, Icon }) => (
                            <button
                              key={id}
                              className={"dock-btn sm" + (item.shape === id ? " on" : "")}
                              aria-label={label}
                              onClick={() => {
                                updateLocal(item.id, { shape: id })
                                patchItem(item.id, { shape: id })
                              }}
                            >
                              <Icon size={14} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            )
          })()}
        </div>
      ) : null}

      <div className="canvas-dock labelled flat" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className={"dock-btn" + (tool === "select" ? " on" : "")}
          onClick={() => {
            setTool("select")
            setWire(null)
          }}
        >
          <IconCursor />
          <span>Select</span>
        </button>
        <button
          className={"dock-btn" + (tool === "card" ? " on" : "") + (dragTool === "card" ? " dragging" : "")}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/ohq-tool", "card")
            e.dataTransfer.effectAllowed = "copy"
            setDragTool("card")
          }}
          onDragEnd={() => setDragTool(null)}
          onClick={() => setTool(tool === "card" ? "select" : "card")}
        >
          <IconCard />
          <span>Card</span>
        </button>
        <button
          className={"dock-btn" + (tool === "sticky" ? " on" : "") + (dragTool === "sticky" ? " dragging" : "")}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/ohq-tool", "sticky")
            e.dataTransfer.effectAllowed = "copy"
            setDragTool("sticky")
          }}
          onDragEnd={() => setDragTool(null)}
          onClick={() => setTool(tool === "sticky" ? "select" : "sticky")}
        >
          <IconSticky />
          <span>Note</span>
        </button>
        <button
          className={"dock-btn" + (tool === "text" ? " on" : "") + (dragTool === "text" ? " dragging" : "")}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/ohq-tool", "text")
            e.dataTransfer.effectAllowed = "copy"
            setDragTool("text")
          }}
          onDragEnd={() => setDragTool(null)}
          onClick={() => setTool(tool === "text" ? "select" : "text")}
        >
          <IconText />
          <span>Text</span>
        </button>

        <div className="dock-shape">
          <button
            className={"dock-btn" + (tool === "shape" ? " on" : "") + (dragTool === "shape" ? " dragging" : "")}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/ohq-tool", "shape")
              e.dataTransfer.effectAllowed = "copy"
              setDragTool("shape")
              setShapeMenu(false)
            }}
            onDragEnd={() => setDragTool(null)}
            onClick={() => {
              setShapeMenu((v) => !v)
              setTool("shape")
            }}
          >
            <IconShapes />
            <span>Shape</span>
          </button>
          {shapeMenu ? (
            <div className="shape-menu">
              {SHAPES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={"dock-btn sm" + (shapeKind === id ? " on" : "")}
                  title={label}
                  onClick={() => {
                    setShapeKind(id)
                    setTool("shape")
                    setShapeMenu(false)
                  }}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          className={"dock-btn" + (tool === "pen" ? " on" : "")}
          onClick={() => setTool(tool === "pen" ? "select" : "pen")}
        >
          <IconPen />
          <span>Draw</span>
        </button>
        <button
          className={"dock-btn" + (tool === "link" ? " on" : "") + (dragTool === "link" ? " dragging" : "")}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/ohq-tool", "link")
            e.dataTransfer.effectAllowed = "copy"
            setDragTool("link")
          }}
          onDragEnd={() => setDragTool(null)}
          onClick={() => setTool(tool === "link" ? "select" : "link")}
        >
          <IconLink />
          <span>Link</span>
        </button>

        <span className="dock-sep" />

        <button
          className={"dock-btn" + (wire ? " accent on" : "")}
          onClick={() => {
            if (wire) {
              setWire(null)
              return
            }
            const item = selected ? itemById.get(selected) : null
            if (item) {
              startWire(item)
              return
            }
            setToast("Select a card first, or use its Connect button")
          }}
        >
          <IconConnect />
          <span>Connect</span>
        </button>

        <button className="dock-btn" title="Space out overlapping cards" onClick={tidyBoard}>
          <IconTarget />
          <span>Tidy</span>
        </button>

        <span className="dock-sep" />

        <button
          className="dock-btn"
          title="Undo (Ctrl + Z)"
          disabled={history.undo === 0}
          onClick={() => undo()}
        >
          <IconUndo />
          <span>Undo</span>
        </button>
        <button
          className="dock-btn"
          title="Redo (Ctrl + Shift + Z)"
          disabled={history.redo === 0}
          onClick={() => redo()}
        >
          <IconRedo />
          <span>Redo</span>
        </button>
        <button className="dock-btn" title="See everything in one view" onClick={zoomToFit}>
          <IconFit />
          <span>Fit view</span>
        </button>

        <span className="dock-sep" />

        <div className="zoom-group">
          <button
            className="dock-btn sm"
            title="Zoom out (Ctrl + −)"
            aria-label="Zoom out"
            onClick={() => zoomTo(zoom / 1.15)}
          >
            <IconMinus />
          </button>
          <button className="zoom-value" title="Click to reset to 100%" onClick={() => zoomTo(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="dock-btn sm"
            title="Zoom in (Ctrl + +)"
            aria-label="Zoom in"
            onClick={() => zoomTo(zoom * 1.15)}
          >
            <IconPlus />
          </button>
          <button className="dock-btn sm" title="Fit everything on screen" onClick={zoomToFit}>
            <IconTarget />
          </button>
        </div>
      </div>
    </div>
  )
}
