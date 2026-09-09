// When the app is served behind a path prefix (for example the code-server
// preview at /absproxy/3400), every asset, route, and API call has to carry
// that prefix. Next handles it for pages and assets via `basePath`, but plain
// fetch calls need it added manually, which is what apiFetch does.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ""

export function withBase(path: string) {
  if (!BASE_PATH) return path
  if (!path.startsWith("/")) return path
  if (path.startsWith(BASE_PATH)) return path
  return BASE_PATH + path
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(withBase(path), init)
}
