import { randomUUID } from 'node:crypto'
import { shell } from 'electron'
import type { AuthProvider, AuthState, AuthUser } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/constants'
import type { DataStore } from '../db'
import { createLogger } from '../utils/logger'

const PROVIDERS: AuthProvider[] = ['google', 'github']

const log = createLogger('auth')
const META_KEY = 'auth.user'
const PROTOCOL = process.env.VITE_APP_PROTOCOL || 'tokenmaxxing'

/**
 * OAuth via the system browser + custom-protocol deep-link callback. The desktop
 * app never holds OAuth client secrets — it opens the backend's `/auth/:provider`
 * endpoint, which performs the exchange and redirects back to
 * `tokenmaxxing://auth/callback#token=…`. The main process intercepts that URL
 * and calls {@link handleCallbackUrl}.
 */
export class AuthService {
  private state: AuthState = { status: 'signed-out', user: null }
  private onChange?: (state: AuthState) => void
  private listeners = new Set<(state: AuthState) => void>()
  /** Random nonce for the in-flight OAuth attempt; guards against forged callbacks. */
  private pendingState: string | null = null

  constructor(private store: DataStore) {
    const raw = store.meta.get(META_KEY)
    if (raw) {
      try {
        this.state = { status: 'signed-in', user: JSON.parse(raw) as AuthUser }
      } catch {
        /* ignore corrupt state */
      }
    }
  }

  setOnChange(cb: (state: AuthState) => void): void {
    this.onChange = cb
  }

  /** Add an extra auth-state listener (e.g. the tray). Returns an unsubscribe fn. */
  subscribe(cb: (state: AuthState) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getState(): AuthState {
    return this.state
  }

  private emit(): void {
    this.onChange?.(this.state)
    for (const l of this.listeners) l(this.state)
  }

  private baseUrl(): string | null {
    return process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || null
  }

  async signIn(provider: AuthProvider): Promise<AuthState> {
    const base = this.baseUrl()
    if (!base) {
      log.warn('no backend configured; cannot start OAuth')
      this.state = { status: 'signed-out', user: null }
      this.emit()
      throw new Error('Cloud backend not configured. Set VITE_API_BASE_URL to enable sign-in.')
    }
    // Embed a one-time nonce in the deep-link target. The backend round-trips it
    // back in the callback URL, so we can reject any callback we didn't initiate
    // (e.g. another local app or a web page firing tokenmaxxing://auth/callback).
    this.pendingState = randomUUID()
    const redirect = encodeURIComponent(`${PROTOCOL}://auth/callback?state=${this.pendingState}`)
    const url = `${base}/auth/${provider}?redirect_uri=${redirect}`
    this.state = { status: 'pending', user: null }
    this.emit()
    await shell.openExternal(url)
    return this.state
  }

  /** Called by the main process when a `tokenmaxxing://auth/callback` URL arrives. */
  handleCallbackUrl(url: string): void {
    try {
      const parsed = new URL(url)
      // Require the exact callback target (AND, not OR — the loose check let
      // many unrelated URLs through).
      if (parsed.host !== 'auth' || !parsed.pathname.includes('callback')) return

      // Verify the nonce we issued in signIn(); reject forged/replayed callbacks.
      const state = parsed.searchParams.get('state')
      if (!this.pendingState || state !== this.pendingState) {
        log.warn('rejected auth callback with missing/mismatched state')
        return
      }
      this.pendingState = null

      const frag = new URLSearchParams(parsed.hash.replace(/^#/, ''))
      const token = frag.get('token')
      if (!token) {
        log.warn('auth callback missing token')
        return
      }
      const rawProvider = frag.get('provider')
      const provider: AuthProvider = PROVIDERS.includes(rawProvider as AuthProvider)
        ? (rawProvider as AuthProvider)
        : 'google'
      const user: AuthUser = {
        id: frag.get('id') ?? 'unknown',
        email: frag.get('email'),
        name: frag.get('name'),
        avatarUrl: frag.get('avatar'),
        provider
      }
      this.store.meta.set('auth.token', token)
      this.store.meta.set(META_KEY, JSON.stringify(user))
      this.state = { status: 'signed-in', user }
      this.emit()
      log.info('signed in via', user.provider)
    } catch (err) {
      log.error('failed to handle auth callback', err)
    }
  }

  signOut(): AuthState {
    this.pendingState = null
    // Privacy: wipe ALL locally-stored usage data (sessions, metrics, scan
    // checkpoints, daily rollups) on logout — leave nothing behind. clearAll()
    // also drops the settings + meta rows, so preserve the user's preferences
    // (theme, enabled tools, privacy choices) and restore them afterward.
    const settings = this.store.settings.get()
    try {
      this.store.clearAll()
    } catch {
      /* ignore */
    }
    if (settings) {
      // Reset the leaderboard identity (handle + country) and cloud opt-in so the
      // next sign-in — possibly a DIFFERENT account on this machine — starts clean
      // and adopts its own name rather than inheriting the previous user's. Keep
      // all other preferences (theme, enabled tools, scan frequency).
      this.store.settings.save({
        ...settings,
        handle: DEFAULT_SETTINGS.handle,
        countryCode: null,
        privacy: DEFAULT_SETTINGS.privacy
      })
    }
    this.state = { status: 'signed-out', user: null }
    this.emit()
    return this.state
  }

  token(): string | null {
    return this.store.meta.get('auth.token') || null
  }
}
