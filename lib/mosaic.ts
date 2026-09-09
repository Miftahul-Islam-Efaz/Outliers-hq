/**
 * Deterministic look-up for the idea mosaic.
 *
 * Every visual choice (colour, tile height, line-art variant) is derived from
 * the idea's id, so the same idea always renders identically on every reload
 * and every device. Nothing here may use Math.random().
 */

export type TileSize = "short" | "square" | "tall"
export type ArtVariant = "a" | "b" | "c" | "d"

export type Swatch = { name: string; bg: string; fg: string }

export const SWATCHES: Swatch[] = [
  { name: "orange", bg: "#F0532A", fg: "#FFFFFF" },
  { name: "cream", bg: "#EDEAE0", fg: "#23281F" },
  { name: "dark", bg: "#2B302A", fg: "#EDEAE0" },
  { name: "yellow", bg: "#F2C230", fg: "#23281F" },
]

/** Stable 32-bit string hash (FNV-1a). Same input, same output, forever. */
export function hashId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Roughly 30% short, 40% square, 30% tall. */
export function sizeFor(hash: number): TileSize {
  const bucket = (hash >>> 3) % 10
  if (bucket < 3) return "short"
  if (bucket < 7) return "square"
  return "tall"
}

export function artFor(hash: number): ArtVariant {
  return (["a", "b", "c", "d"] as ArtVariant[])[(hash >>> 7) % 4]
}

/** Art sits in the half of the tile the text does not use. */
export function artAtTop(hash: number): boolean {
  return ((hash >>> 11) & 1) === 1
}

export const ASPECT: Record<TileSize, string> = {
  short: "1 / 0.75",
  square: "1 / 1",
  tall: "1 / 1.4",
}

/**
 * Assigns a swatch per idea from its hash, then walks the list in render order
 * and nudges any tile that would touch a same-coloured neighbour onto the next
 * colour in the rotation.
 */
export function assignSwatches(ids: string[]): Swatch[] {
  const out: Swatch[] = []
  let previous = -1
  for (const id of ids) {
    let index = hashId(id) % SWATCHES.length
    if (index === previous) index = (index + 1) % SWATCHES.length
    out.push(SWATCHES[index])
    previous = index
  }
  return out
}
