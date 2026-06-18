<div align="center">

# ⚡ TokenMaxxing

**GitHub Contributions × Spotify Wrapped — for AI developers.**

A premium, local-first desktop app that analyzes how you use AI coding tools:
tokens consumed, tools used, streaks, global rankings, achievements, and an
annual *AI Wrapped*. Your code never leaves your machine.

</div>

> **This is the desktop application** — one of three separate TokenMaxxing repos:
> this app, the backend API, and the marketing website. The app talks to the
> backend via `VITE_API_BASE_URL` (default `http://localhost:8787`); it also runs
> fully offline with on-device estimates.

---

## ✨ Features

- **Dashboard** — tokens today/this month, active sessions, coding hours, global
  rank, current streak, a token-usage chart (daily/weekly/monthly/yearly), a tool
  breakdown donut, and recent sessions.
- **Analytics** — a GitHub-style contribution heatmap, monthly tokens by tool,
  top projects, and models used.
- **Sessions** — searchable, filterable, sortable history of every AI session.
- **Rankings** — global / country / tool-specific ranks + a leaderboard
  (on-device estimate by default; opt in to compare globally).
- **AI Wrapped** — a shareable, exportable (PNG) year-in-review.
- **Estimated AI spend** — what your usage would cost at public per-model API
  pricing. Input / output / cache-read / cache-write are priced separately per
  model (`src/shared/pricing.ts`), so Claude's cheap cache reads aren't
  over-counted. Shown on the Dashboard and broken down by model in Analytics.
- **macOS menu-bar tray** — today's tokens live in the status bar; click for
  today's tokens, global rank, spend, and quick actions (Apple Silicon build).
- **Privacy controls** — disable cloud sync, export everything, delete all data.

## 🛠 Tech stack

| Layer        | Choice                                                       |
| ------------ | ----------------------------------------------------------- |
| Desktop      | Electron + electron-vite                                     |
| UI           | React + TypeScript + Tailwind + shadcn/ui + Framer Motion   |
| Charts       | Recharts (+ custom SVG heatmap/sparklines)                  |
| State        | Zustand                                                      |
| Local DB     | SQLite (better-sqlite3) with a JSON fallback                |
| Backend      | Node + Express + Supabase/PostgreSQL (optional)             |
| Auth         | Google + GitHub OAuth (system browser + deep link)         |

## 🔒 Privacy by design

- **Never** uploads source code, prompts, or conversations.
- All scanning happens locally; adapters return only **aggregated counts**.
- Cloud sync is **off by default**. With it off, nothing leaves the device.
- One-click **export** and **delete-all**.

## 🧩 Scanner & adapter pattern

Each tool has an adapter returning `{ toolName, sessionCount, estimatedTokens,
activeHours, projectCount, … }`. Token counts are **exact** where the tool
records them (Claude Code's `usage`) and **clearly-labeled estimates** otherwise.

```
ToolAdapter (abstract)
├── ClaudeAdapter        ~/.claude/projects/**.jsonl   (exact usage)
├── CursorAdapter        ~/.cursor/ai-tracking/*.db    (SQLite via sql.js/WASM — no native build)
├── CodexAdapter         ~/.codex/**.jsonl             (real token usage, byte-estimate fallback)
└── LogDirectoryAdapter  (byte-density estimate)
    ├── AiderAdapter     ~/.aider
    ├── GeminiAdapter    ~/.gemini            (auto-detect)
    ├── ClineAdapter     editor globalStorage (auto-detect)
    └── RooCodeAdapter   editor globalStorage (auto-detect)
```

The Cursor DB is read **read-only via `sql.js` (WebAssembly)** with a fast path
through `better-sqlite3` when it's built — so Cursor works on any machine with no
native toolchain. See `src/main/scanner/sqliteRead.ts`.

Add a tool by subclassing `ToolAdapter` and registering it in
`src/main/scanner/adapters/index.ts` — the dashboard, rankings, and achievements
pick it up automatically.

### Incremental scanning (compute the past once)

Each adapter `enumerate()`s its sources (files / the Cursor DB) with a cheap
content **fingerprint** (`size:mtime`). The base compares fingerprints to stored
`scan_checkpoints`; **only new or changed sources are parsed**, everything else
is reused from SQLite. Historical conversations are therefore computed exactly
once — later scans only touch recent activity.

```
First scan:  287 sources parsed · 0 cached   → ~1.3 s
Next scan:     0 sources parsed · 287 cached → ~20 ms   (same totals)
```

Deleted sources are detected (present-keys diff) and their sessions/checkpoints
are removed. Derived data (tool metrics, daily rollups) is recomputed from the
full session set after each diff — pure aggregation, no re-reading of logs.

## 📁 Project structure

```
src/
├── shared/      types · ipc contract · achievements · ranking · constants
├── main/        Electron main: window, db (SQLite), scanner, services, ipc
├── preload/     contextBridge → window.api
└── renderer/    React app: pages, components, charts, stores, lib
```

The cloud API (rankings, leaderboard, OAuth, Supabase) is a **separate service**
— the app only needs its URL via `VITE_API_BASE_URL`.

## 🚀 Development

```bash
npm install            # installs deps + rebuilds better-sqlite3 for Electron
npm run dev            # launch the app with HMR
npm run typecheck      # tsc for main + renderer
npm run build          # bundle main/preload/renderer
npm run dist           # package installers (electron-builder)
```

> **Preview in a browser:** the renderer runs standalone with rich demo data
> when `window.api` is absent — handy for design iteration.

### Native module note

`better-sqlite3` is a native module. `postinstall` runs
`electron-builder install-app-deps` to rebuild it against Electron's ABI. If that
ever fails, the app **still boots** — it transparently falls back to a
JSON-file-backed store (`src/main/db/MemoryDataStore.ts`). Re-run
`npm run rebuild` to restore SQLite.

## ☁️ Cloud backend (optional)

The app talks to the dedicated backend service over HTTP. Set `VITE_API_BASE_URL`
in `.env` to enable rankings sync, the leaderboard/globe, and OAuth sign-in.
**Supabase keys and OAuth client secrets live in the backend, not here** — the
desktop app never holds them. Without a backend URL the app runs fully offline
with on-device estimates.

## 🗺 Roadmap

Architected for: team dashboards, company analytics, AI-spend tracking,
productivity scoring, GitHub integration, public profiles, recruiter marketplace.

## 📄 License

MIT © Launchcraft Studio
