# Outliers Hq

Team idea board: capture ideas as notes (with YouTube/Instagram/Facebook link previews,
likes/dislikes and author tags) and think visually on infinite whiteboards with cards,
shapes, drawings, connectors, images and undo/redo.

## Stack
- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres + Storage) — tables: users, notes, note_reactions, whiteboards, whiteboard_items, whiteboard_edges

## Run locally
```bash
npm install
cp .env.local.example .env.local   # fill in SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_SECRET
npm run dev                        # http://localhost:3400
```

## Deploy
`npm run build && npm run start` (serves on port 3400).
