# TokenMaxxing — Implementation Prompt: Auth Gating, Local 2s Analysis, Leaderboard + Globe

> Copy/paste the block below into your implementing AI. It is self-contained and
> resolves the 1-minute-vs-5-minute cadence ambiguity (see §8 and §15).

---

## ROLE
You are a senior full-stack engineer working on **TokenMaxxing**, an Electron
desktop app that analyzes a developer's *local* AI coding-tool usage (Claude
Code, Cursor, Codex). Implement the features below end-to-end: Electron main
(Node), renderer (React), and the backend (`server/`) + Supabase (Postgres).
Honor every existing project invariant in §1. Do not break incremental scanning,
the net token model, or the privacy guarantee.

## 1. PROJECT CONTEXT — INVARIANTS YOU MUST PRESERVE
- **App shape:** Electron desktop app. Main process scans local history; renderer
  (React) shows analytics. Backend lives in `server/`; cloud DB is Supabase
  (Postgres). Local DB is SQLite (`better-sqlite3`, with a JSON fallback when the
  native module can't build).
- **Tools analyzed:** Claude Code, Cursor, Codex (primary). Others are bonus.
- **Incremental computation is a HARD requirement.** Never recompute historical
  data. Full compute runs once; later scans only process new/changed sources via
  per-source fingerprints (`size:mtime`) + the `scan_checkpoints` table.
- **Token model (do NOT revert):** "tokens used" = `input + output` only
  (excludes BOTH `cacheRead` and `cacheCreate`). Count *cards* show GROSS
  (`input + output + cacheCreate + cacheRead`, labeled "incl. cache"); chart/spend
  stay NET ("excl. cache"). `costForBreakdown` prices input+output only.
- **Privacy-first (NON-NEGOTIABLE):** NEVER upload source code, prompts, or
  conversation content. Supabase receives **aggregated metrics only**, and only
  when the user has opted in.
- **Existing TODO to build on:** OAuth token-exchange in
  `server/src/routes/auth.ts` is currently a stub — complete it here.
- **Dashboard is tab-driven:** top Daily/Weekly/Monthly/Yearly tab drives stat
  cards + chart. The new leaderboard/globe is a NEW top-level nav tab.

## 2. FEATURES TO BUILD
1. **Auth gating (Google).** Require Google sign-in/sign-up before ANY token
   usage data is rendered. If not authenticated, render the auth wall only — no
   metrics, no cards, no chart, no leaderboard, no cached data.
2. **Post-login disclosure.** After login, surface a clear, persistent notice:
   "Your usage is auto-analyzed locally every 2 seconds, and detailed data is
   stored in your database." (Copy in §10.2.)
3. **Periodic server-side leaderboard.** A scheduled DB job computes the top
   users on a fixed cadence (RESOLVED: **every 60 seconds**, fallback 5 minutes —
   see §8/§15).
4. **Country-wise "shipping" leaderboard + globe.** In the new nav tab, show a
   country-ranked leaderboard of token activity ("who is shipping more, from
   where") plus an interactive 3D globe of shipping-origin metrics.
   > Terminology: "shipping" = token/usage activity attributed to a coarse,
   > country-level origin. There is no physical shipping in this product.

## 3. ARCHITECTURE & DATA FLOW
```
┌──────────────────────────── Electron app ─────────────────────────────┐
│ Renderer (React)                    Main process (Node)                 │
│  • Auth wall (Google)                • Incremental scanner (2s loop)     │
│  • Disclosure banner                 • Aggregator → NET metrics          │
│  • Dashboard tabs                    • Local SQLite (detailed + agg)     │
│  • Leaderboard + Globe tab           • Supabase sync (opt-in, debounced) │
└───────────┬───────────────────────────────────┬───────────────────────┘
            │ IPC                                 │ HTTPS (Bearer JWT)
            ▼                                     ▼
   ┌─────────────────┐                  ┌──────────────────────────┐
   │ Local SQLite    │                  │ server/  (API)           │
   │  detailed rows  │                  │  /auth /metrics /leaderbd │
   └─────────────────┘                  └────────────┬─────────────┘
                                                      ▼
                                        ┌──────────────────────────┐
                                        │ Supabase (Postgres)       │
                                        │  users, user_metrics,     │
                                        │  leaderboard_snapshots,   │
                                        │  country_rollups          │
                                        │  + scheduled recompute job│
                                        └──────────────────────────┘
```
**Flow:** (1) main scans locally every 2s (incremental only). (2) Detailed rows
→ local SQLite. (3) NET aggregates (tokens, spend, sessions, hours) → `POST
/metrics/sync` (only if opted in + authenticated). (4) A scheduled Postgres job
recomputes leaderboard + country rollups every 60s. (5) Renderer fetches
snapshots for the leaderboard/globe.

## 4. DATA MODELS / SCHEMA
**Local SQLite (existing + additions):** keep `scan_checkpoints`. Add a small
`sync_queue` table (id, payload_json, created_at, attempts) for offline-tolerant
Supabase sync.

**Supabase (Postgres) — new/changed tables:**
```sql
-- Identity (created on first Google login)
create table users (
  id            uuid primary key default gen_random_uuid(),
  google_sub    text unique not null,        -- Google subject id
  email         text not null,
  display_name  text,
  avatar_url    text,
  country_code  char(2),                      -- ISO-3166-1 alpha-2, server-derived
  is_anon       boolean not null default false, -- opt out of public name on board
  opted_in      boolean not null default false, -- cloud sync consent
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

-- Per-user aggregated NET metrics (never raw content)
create table user_metrics (
  user_id     uuid references users(id) on delete cascade,
  period      text not null check (period in ('daily','weekly','monthly','yearly','alltime')),
  tokens_net  bigint not null default 0,     -- input + output ONLY
  spend_usd   numeric(12,2) not null default 0,
  sessions    int not null default 0,
  coding_hours numeric(10,2) not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, period)
);

-- Materialized leaderboard, refreshed by the scheduled job
create table leaderboard_snapshots (
  snapshot_at timestamptz not null,
  period      text not null,
  metric      text not null,                  -- 'tokens_net' | 'spend_usd' | 'sessions'
  rank        int not null,
  user_id     uuid references users(id),
  value       numeric not null,
  primary key (snapshot_at, period, metric, rank)
);

-- Country rollups for the globe + country leaderboard
create table country_rollups (
  snapshot_at  timestamptz not null,
  period       text not null,
  country_code char(2) not null,
  total_tokens bigint not null,
  total_spend  numeric(14,2) not null,
  user_count   int not null,
  primary key (snapshot_at, period, country_code)
);
```
**RLS:** `users`/`user_metrics` → a row is readable/writable only by its owner
(`auth.uid() = user_id`). `leaderboard_snapshots`/`country_rollups` → read-only
to any authenticated user; written only by the service-role scheduled job. When
`is_anon = true`, the API must redact `display_name`/`avatar_url` to "Anonymous".

## 5. AUTH FLOW & ACCESS CONTROL
- **Provider:** Google OAuth 2.0 (sign-in == sign-up; first login provisions the
  `users` row). [SPECIFY: Supabase Auth vs custom OAuth in `server/`]. Default to
  Supabase Auth Google provider unless told otherwise.
- **Desktop flow:** renderer opens the system browser (or a secure BrowserWindow)
  for Google consent → redirect to a loopback/custom-scheme callback → exchange
  code for tokens in `server/src/routes/auth.ts` (complete the existing TODO) →
  store a short-lived access JWT + refresh token in the OS keychain
  ([SPECIFY: keytar vs safeStorage]).
- **Gating (defense in depth):**
  - *UI:* a top-level `AuthGate` wraps the entire authenticated app. No metrics
    component mounts until a valid session exists. On logout, purge in-memory
    metrics and any rendered cache.
  - *API:* every `/metrics/*` and `/leaderboard/*` route requires a valid Bearer
    JWT; reject with 401 otherwise. Leaderboard data is only served to
    authenticated users.
  - *Local:* the 2s scanner MAY run pre-auth to warm the cache, but the renderer
    MUST NOT display results until authenticated. [SPECIFY: whether to defer
    scanning entirely until login for stricter gating — default: scan but hide.]
- **Session lifecycle:** silent refresh before expiry; on refresh failure, drop
  to the auth wall. Endpoints: `POST /auth/google`, `GET /auth/session`,
  `POST /auth/refresh`, `POST /auth/logout`.

## 6. LOCAL ANALYSIS (2s LOOP) & DATA HANDLING
- A main-process timer runs every **2000 ms**. Each tick performs an
  **incremental** scan only: check each source's `size:mtime` fingerprint against
  `scan_checkpoints`; skip unchanged sources; parse only new/changed history.
  (Warm ticks must stay in the ~tens-of-ms range — do not re-parse history.)
- Coalesce/lock: a tick must no-op if the previous tick is still running (no
  overlapping scans). Use a single in-flight flag.
- On change, recompute NET aggregates and push deltas to the renderer via IPC so
  the UI updates live. Persist detailed rows to local SQLite.
- Backoff: if a tick errors or finds nothing for N consecutive ticks, you MAY
  widen the interval (e.g. 2s → 5s → 10s) and snap back to 2s on activity.
  [SPECIFY: whether adaptive backoff is desired — default: keep flat 2s.]

## 7. STORAGE STRATEGY
- **Local SQLite:** authoritative store for detailed per-session/per-tool data.
  JSON fallback when the native module is unavailable (preserve existing
  behavior).
- **Supabase:** aggregated NET metrics + country code only, opt-in. Sync via
  `sync_queue`: enqueue aggregates, flush on a debounced cadence
  (RESOLVED: **every 30s**, or immediately after a material change, whichever is
  later), retry with exponential backoff when offline. Never enqueue raw content.
- **Country derivation:** the server derives `country_code` from the request IP at
  sync/login time (coarse, country-level only). Do NOT collect precise
  geolocation. [SPECIFY: GeoIP provider]. Allow the user to override/hide country.

## 8. TIMING CADENCES (EXPLICIT)
| Concern | Cadence | Fallback / degraded |
|---|---|---|
| Local incremental analysis | **2 s** | adaptive backoff optional (§6) |
| Supabase metrics sync | **30 s** (debounced) | queue + exp. backoff when offline |
| **Leaderboard + country recompute (server)** | **60 s (1 min)** ✅ | **300 s (5 min)** under load (§15) |
| Client fetch of snapshots | **60 s**, aligned to snapshot + jitter | show last snapshot if fetch fails |

**Resolution:** the leaderboard recompute cadence is **60 seconds**. See §15 for
why 1 minute beats 5 minutes here and when to fall back to 5 minutes.

## 9. API CONTRACTS
All `/metrics/*` and `/leaderboard/*` require `Authorization: Bearer <jwt>`.
```
POST /auth/google        { code, redirect_uri } -> { access, refresh, user }
GET  /auth/session       -> { user } | 401
POST /auth/refresh       { refresh } -> { access, refresh }
POST /auth/logout        -> 204

POST /metrics/sync       (auth) body:
  { period, tokens_net, spend_usd, sessions, coding_hours, client_ts }
  -> { ok: true, server_ts }
  // server upserts user_metrics; derives/refreshes country_code from IP.

GET  /leaderboard/top    (auth) ?period=weekly&metric=tokens_net&limit=50
  -> { snapshot_at, period, metric,
       entries: [{ rank, user_id, display_name|null, avatar_url|null, value, is_self }] }

GET  /leaderboard/countries (auth) ?period=weekly
  -> { snapshot_at, period,
       countries: [{ country_code, total_tokens, total_spend, user_count }] }
```
Errors: `401` unauthenticated, `403` not opted-in (for sync), `429` rate-limited,
`503` snapshot not yet computed (client shows "computing…"). Responses include
`snapshot_at` so the client can show data freshness.

## 10. UI/UX SPECS
### 10.1 Auth wall
Full-screen, branded (open-box silver cube logo). Single "Continue with Google"
button. No metrics, charts, or numbers anywhere on the page. Show a one-line
privacy promise: "We never upload your code or prompts."

### 10.2 Post-login disclosure
Persistent, dismissible banner (re-shown each session) directly under the nav:
> "🔄 Your usage is analyzed **locally every 2 seconds**. Detailed data is stored
> in your database. We only sync aggregated metrics — never your code or prompts."
Include a small live "last analyzed Xs ago" indicator tied to the 2s loop.

### 10.3 Leaderboard + Globe tab (new top-level nav tab)
- **Period + metric selectors** (Daily/Weekly/Monthly/Yearly · tokens/spend/sessions).
- **Top users leaderboard:** rank, avatar, name (or "Anonymous" if `is_anon`),
  value, sparkline optional. Highlight the current user's row (`is_self`) and pin
  it if outside the visible top-N. Show `snapshot_at` freshness ("updated 12s ago").
- **Country-wise shipping leaderboard:** table ranked by `total_tokens` per
  country — flag, country name, total tokens, # devs, total spend.
- **Globe visualization:** interactive 3D globe ([SPECIFY: `cobe`, `react-globe.gl`,
  or `three.js`] — default `react-globe.gl`). Render one marker/bar per country at
  its centroid, height/radius/color scaled by `total_tokens` (log scale). Optional
  arcs from each country to a neutral hub to convey "shipping from". Hover/tap
  tooltip: country, tokens, devs, spend. Auto-rotate; pause on interaction;
  clicking a country filters the country table. Respect reduced-motion. Provide a
  flat-map fallback if WebGL is unavailable.
- **Empty/loading states:** "Computing leaderboard…" when `503`; "No data yet —
  analyze some sessions" when the user has zero metrics.

## 11. EDGE CASES
- Not logged in → render auth wall only; never paint cached numbers.
- Logout → wipe in-memory + rendered metrics immediately.
- Offline → local 2s analysis continues; sync queues and retries; leaderboard
  shows last fetched snapshot with a "stale" badge.
- Token/refresh expiry mid-session → silent refresh; on failure, fall to wall.
- Snapshot not yet computed (cold start) → `503` → "computing…" state.
- User opted out of cloud sync → app fully usable locally; user simply doesn't
  appear on the leaderboard; never enqueue their data.
- Anonymous user → redact name/avatar in all leaderboard responses.
- Ties in leaderboard → stable secondary sort (e.g. `user_id`).
- Missing/unknown country → bucket as `ZZ`/"Unknown"; exclude from globe markers
  but include in a country-table "Unknown" row.
- Overlapping 2s ticks → in-flight lock no-ops the new tick.
- Clock skew between client and server → trust `server_ts` for snapshot ordering.

## 12. SECURITY & PRIVACY
- **Privacy guarantee:** never transmit source code, prompts, or conversation
  text. Only NET aggregates + coarse country leave the device, and only with
  opt-in consent.
- **Country = coarse only** (country-level, server-derived from IP). No precise
  geolocation, no city. User can hide/override.
- **AuthN/Z:** validate JWT signature + expiry on every protected route. Enforce
  RLS so users can only read/write their own detailed rows; leaderboard tables are
  service-role-write, authenticated-read.
- **Anti-abuse:** rate-limit `/metrics/sync` and `/leaderboard/*`; reject
  implausible metric jumps server-side (sanity caps) to prevent leaderboard
  gaming; never trust client-supplied country.
- **Secrets:** store tokens in the OS keychain, not plaintext/localStorage.
- **Data retention / deletion:** provide account deletion that cascades
  `user_metrics` and removes the user from future snapshots. [SPECIFY: data
  retention policy] and [SPECIFY: GDPR/CCPA export-and-delete requirements].
- **Consent:** explicit opt-in toggle for cloud sync + leaderboard participation,
  reversible at any time.

## 13. PLACEHOLDERS TO RESOLVE
- [SPECIFY: tech stack details — Supabase Auth vs custom OAuth in `server/`]
- [SPECIFY: globe library — `react-globe.gl` / `cobe` / `three.js`]
- [SPECIFY: GeoIP provider for country derivation]
- [SPECIFY: keychain mechanism — `keytar` vs Electron `safeStorage`]
- [SPECIFY: data retention policy + deletion SLA]
- [SPECIFY: leaderboard default metric + default period]
- [SPECIFY: whether scanning is deferred until login or runs hidden pre-auth]
- [SPECIFY: adaptive backoff for the 2s loop — on/off]

## 14. EXECUTION CHECKLIST
1. [ ] Supabase migrations: `users`, `user_metrics`, `leaderboard_snapshots`,
       `country_rollups` + RLS policies.
2. [ ] Complete Google OAuth token-exchange in `server/src/routes/auth.ts`;
       add `/auth/session|refresh|logout`.
3. [ ] Keychain storage for tokens; silent refresh; `AuthGate` wrapping the app.
4. [ ] Auth wall UI (no metrics) + post-login disclosure banner.
5. [ ] 2s incremental scan loop with in-flight lock; live IPC updates.
6. [ ] Aggregator → NET metrics; `sync_queue` + debounced 30s Supabase sync
       (opt-in only); offline retry.
7. [ ] Scheduled recompute job (pg_cron / edge fn) every **60s** writing
       snapshots + country rollups; degraded 300s path.
8. [ ] `/metrics/sync`, `/leaderboard/top`, `/leaderboard/countries` with JWT +
       rate limits + anon redaction.
9. [ ] Leaderboard + Globe nav tab: top-users board, country board, 3D globe,
       freshness/empty/loading states, WebGL fallback.
10. [ ] Consent + anonymity + account-deletion controls.
11. [ ] Tests: auth gating (no data when logged out), incremental 2s loop stays
        warm, snapshot cadence, RLS, anon redaction, offline sync, privacy
        (assert no raw content ever leaves the device).

## 15. CONFLICT-RESOLUTION — LEADERBOARD CADENCE (1 min vs 5 min)
**Decision: 60 seconds (1 minute) is the canonical recompute cadence.**
- *Why 1 minute:* local analysis is every 2s, so users expect a live, competitive
  feel. A 5-minute board feels stale next to second-by-second local numbers. At
  expected scale, a per-minute aggregate recompute over `user_metrics` is cheap.
- *Client alignment:* clients poll every 60s aligned to `snapshot_at` (+ jitter)
  so everyone reads the same snapshot; never recompute per-request.
- *Fallback to 5 minutes (300s)* — switch automatically when ANY holds:
  (a) recompute job runtime exceeds [SPECIFY: e.g. 10s] for 3 consecutive runs;
  (b) DB CPU/cost budget exceeds [SPECIFY: threshold];
  (c) active user count exceeds [SPECIFY: N]. Surface the active cadence in
  `snapshot_at` freshness so the UI reflects reality.
- *Non-goal:* sub-minute leaderboard recompute. The 2s cadence is for LOCAL
  analysis only — do not push per-2s user updates to the server.

## 16. ACCEPTANCE CRITERIA
- Logged-out users see ZERO usage data anywhere (UI + API enforced).
- After login, the 2s-analysis + DB-storage disclosure is clearly shown.
- Leaderboard + country rollups refresh on a 60s cadence with a working 5-min
  degraded path; client shows data freshness.
- Globe renders shipping-origin metrics by country with hover details and a
  non-WebGL fallback.
- No raw code/prompts/conversations ever leave the device; only opted-in
  aggregates + coarse country are synced; RLS verified.
- Incremental scanning remains intact (warm 2s ticks stay fast; no full recompute).
```
```
