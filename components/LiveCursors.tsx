"use client"

import { useEffect, useRef } from "react"
import type { Cursor } from "@/lib/useLive"

type Props = {
  /** Live positions, mutated in place by useLive. Never a render input. */
  cursorsRef: { current: Map<string, Cursor> }
  /** Who currently has a cursor. Changes on join/leave only. */
  ids: string[]
  colorOf: (id: string) => string
  nameOf: (id: string) => string
}

/**
 * Draws teammate cursors at display frame rate.
 *
 * The positions deliberately bypass React: an incoming packet only mutates a
 * ref, and this component writes `transform` straight onto the DOM node inside
 * a requestAnimationFrame loop. Previously each packet called setState on the
 * board, so every mouse move from every teammate re-rendered the whole canvas
 * (hundreds of items) - that is why remote cursors moved at a crawl while the
 * network was actually delivering plenty of updates.
 */
export default function LiveCursors({ cursorsRef, ids, colorOf, nameOf }: Props) {
  const nodes = useRef<Map<string, HTMLDivElement | null>>(new Map())

  useEffect(() => {
    let frame = 0

    const paint = () => {
      for (const [id, node] of nodes.current) {
        if (!node) continue
        const cursor = cursorsRef.current.get(id)
        if (!cursor) {
          node.style.opacity = "0"
          continue
        }
        node.style.opacity = "1"
        node.style.transform = "translate3d(" + cursor.x + "px," + cursor.y + "px,0)"
      }
      frame = requestAnimationFrame(paint)
    }

    frame = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(frame)
  }, [cursorsRef])

  return (
    <>
      {ids.map((id) => (
        <div
          key={id}
          className="live-cursor"
          ref={(node) => {
            if (node) nodes.current.set(id, node)
            else nodes.current.delete(id)
          }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16">
            <path
              d="M2 1.5 L12.5 8 L7.6 8.6 L5.4 13 Z"
              fill={colorOf(id)}
              stroke="#fff"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
          <span className="live-name" style={{ background: colorOf(id) }}>
            {nameOf(id)}
          </span>
        </div>
      ))}
    </>
  )
}
