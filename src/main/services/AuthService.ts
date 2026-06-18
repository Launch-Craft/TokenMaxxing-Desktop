import { shell } from 'electron'
import type { AuthProvider, AuthState, AuthUser } from '@shared/types'
import type { DataStore } from '../db'
import { createLogger } from '../utils/logger'

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

  getState(): AuthState {
    return this.state
  }

  private emit(): void {
    this.onChange?.(this.state)
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
    const redirect = encodeURIComponent(`${PROTOCOL}://auth/callback`)
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
      if (parsed.host !== 'auth' && !parsed.pathname.includes('callback')) return
      const frag = new URLSearchParams(parsed.hash.replace(/^#/, '') || parsed.search)
      const user: AuthUser = {
        id: frag.get('id') ?? 'unknown',
        email: frag.get('email'),
        name: frag.get('name'),
        avatarUrl: frag.get('avatar'),
        provider: (frag.get('provider') as AuthProvider) ?? 'google'
      }
      const token = frag.get('token')
      if (token) this.store.meta.set('auth.token', token)
      this.store.meta.set(META_KEY, JSON.stringify(user))
      this.state = { status: 'signed-in', user }
      this.emit()
      log.info('signed in via', user.provider)
    } catch (err) {
      log.error('failed to handle auth callback', err)
    }
  }

  signOut(): AuthState {
    this.store.meta.set(META_KEY, '')
    this.store.meta.set('auth.token', '')
    this.state = { status: 'signed-out', user: null }
    this.emit()
    return this.state
  }

  token(): string | null {
    return this.store.meta.get('auth.token') || null
  }
}
