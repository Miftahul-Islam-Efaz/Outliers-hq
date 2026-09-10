export type LinkPreview = {
  provider: string
  url: string
  title: string | null
  thumbnail: string | null
  embedUrl: string | null
}

const YT_THUMB = "https://i.ytimg.com/vi/"
const YT_EMBED = "https://www.youtube.com/embed/"
const IG_BASE = "https://www.instagram.com/"
const FB_PLUGIN = "https://www.facebook.com/plugins/video.php?href="

function youtubeId(u: URL): string | null {
  if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null
  if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null
  if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null
  return u.searchParams.get("v")
}

function metaTag(html: string, prop: string): string | null {
  const patterns = [
    new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]+content=["\']([^"\']+)["\']', "i"),
    new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']' + prop + '["\']', "i"),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return m[1]
  }
  return null
}

function decode(value: string | null | undefined): string | null {
  if (!value) return null
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
}

export function normalizeUrl(raw: string): URL | null {
  const value = raw.trim()
  if (!value) return null
  try {
    return new URL(value.startsWith("http") ? value : "https://" + value)
  } catch {
    return null
  }
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#]|$)/i

/** Is this link the image itself, rather than a page containing one? */
async function directImage(u: URL): Promise<boolean> {
  if (IMAGE_EXT.test(u.pathname)) return true
  try {
    const res = await fetch(u.toString(), {
      method: "HEAD",
      signal: AbortSignal.timeout(6000),
    })
    return (res.headers.get("content-type") || "").startsWith("image/")
  } catch {
    return false
  }
}

export async function buildPreview(raw: string): Promise<LinkPreview | null> {
  const u = normalizeUrl(raw)
  if (!u) return null
  const host = u.hostname.replace(/^www\./, "")

  // A link straight to a .jpg/.png is its own thumbnail.
  if (await directImage(u)) {
    return {
      provider: "image",
      url: u.toString(),
      title: decodeURIComponent(u.pathname.split("/").pop() || "") || u.hostname,
      thumbnail: u.toString(),
      embedUrl: null,
    }
  }

  if (host.includes("youtube.com") || host.includes("youtu.be")) {
    const id = youtubeId(u)
    if (id) {
      return {
        provider: "youtube",
        url: u.toString(),
        title: await fetchTitle(u),
        thumbnail: YT_THUMB + id + "/hqdefault.jpg",
        embedUrl: YT_EMBED + id,
      }
    }
  }

  let provider = "link"
  if (host.includes("instagram.com")) provider = "instagram"
  else if (host.includes("facebook.com") || host.includes("fb.watch")) provider = "facebook"
  else if (host.includes("tiktok.com")) provider = "tiktok"
  else if (host.includes("vimeo.com")) provider = "vimeo"
  else if (host.includes("x.com") || host.includes("twitter.com")) provider = "x"
  else if (host.includes("pinterest.")) provider = "pinterest"

  const meta = await fetchMeta(u)

  let embedUrl: string | null = null
  if (provider === "instagram") {
    const m = u.pathname.match(/\/(p|reel|reels|tv)\/([^/]+)/)
    if (m) {
      const kind = m[1] === "reels" ? "reel" : m[1]
      embedUrl = IG_BASE + kind + "/" + m[2] + "/embed"
    }
  }
  if (provider === "facebook") {
    embedUrl = FB_PLUGIN + encodeURIComponent(u.toString()) + "&show_text=false"
  }

  return {
    provider,
    url: u.toString(),
    title: meta.title,
    thumbnail: meta.thumbnail,
    embedUrl,
  }
}

async function fetchHtml(u: URL): Promise<string | null> {
  try {
    const res = await fetch(u.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,*/*",
        "accept-language": "en-US,en;q=0.9",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.slice(0, 300000)
  } catch {
    return null
  }
}

async function fetchTitle(u: URL): Promise<string | null> {
  const html = await fetchHtml(u)
  if (!html) return null
  return (
    decode(metaTag(html, "og:title")) ||
    decode(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1])
  )
}

async function fetchMeta(u: URL): Promise<{ title: string | null; thumbnail: string | null }> {
  const html = await fetchHtml(u)
  if (!html) return { title: null, thumbnail: null }
  const raw =
    decode(metaTag(html, "og:image")) ||
    decode(metaTag(html, "og:image:secure_url")) ||
    decode(metaTag(html, "og:image:url")) ||
    decode(metaTag(html, "twitter:image")) ||
    decode(metaTag(html, "twitter:image:src")) ||
    // Last resort: a link-rel icon or the first sizeable <img> on the page.
    decode(html.match(/<link[^>]+rel=["'](?:image_src|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i)?.[1]) ||
    decode(html.match(/<img[^>]+src=["']([^"']+\.(?:png|jpe?g|webp|avif)[^"']*)["']/i)?.[1])

  let thumbnail: string | null = null
  if (raw) {
    try {
      // Handles "/img/x.png" and "//cdn/x.png" as well as absolute URLs.
      thumbnail = new URL(raw, u).toString()
    } catch {
      thumbnail = null
    }
  }

  return {
    title:
      decode(metaTag(html, "og:title")) ||
      decode(metaTag(html, "twitter:title")) ||
      decode(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]),
    thumbnail,
  }
}

export const PALETTE = [
  "#FF6A00",
  "#2783DE",
  "#46A171",
  "#8B5CF6",
  "#E56458",
  "#0EA5A4",
  "#DB2777",
  "#111110",
]

export const CATEGORIES = [
  "Idea",
  "Content",
  "Design",
  "Marketing",
  "Product",
  "Research",
  "Random",
]

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("")
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return mins + "m ago"
  const hours = Math.round(mins / 60)
  if (hours < 24) return hours + "h ago"
  const days = Math.round(hours / 24)
  if (days < 30) return days + "d ago"
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
