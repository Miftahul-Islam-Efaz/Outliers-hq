"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/base"

type Usage = { bytes: number; files: number; limit: number; percent: number }

function human(bytes: number) {
  if (bytes < 1024) return bytes + " B"
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return (value < 10 ? value.toFixed(1) : Math.round(value)) + " " + units[unit]
}

/** Live Supabase file storage against the 1 GB free-plan allowance. */
export default function StorageMeter() {
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      const res = await apiFetch("/api/storage")
      const data = await res.json().catch(() => null)
      if (alive && data?.ok) setUsage(data as Usage)
    }
    load()
    const timer = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  if (!usage) return null

  const level = usage.percent >= 90 ? " full" : usage.percent >= 70 ? " warn" : ""

  return (
    <div
      className={"storage-meter" + level}
      title={usage.files + " files stored · " + usage.percent.toFixed(1) + "% of the free 1 GB plan"}
    >
      <span className="storage-label">Storage</span>
      <span className="storage-track">
        <span className="storage-fill" style={{ width: Math.max(2, usage.percent) + "%" }} />
      </span>
      <span className="storage-value">
        {human(usage.bytes)} <span className="storage-of">/ {human(usage.limit)}</span>
      </span>
    </div>
  )
}
