import { create } from 'zustand'
import type { AuthProvider, AuthState } from '@shared/types'
import { client } from '@/lib/ipc'

interface AuthStoreState {
  auth: AuthState
  /** True once the initial auth state has been resolved (avoids wall flash). */
  loaded: boolean
  error: string | null
  load: () => Promise<void>
  signIn: (provider: AuthProvider) => Promise<void>
  signOut: () => Promise<void>
  subscribe: () => () => void
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  auth: { status: 'signed-out', user: null },
  loaded: false,
  error: null,
  load: async () => {
    const auth = await client.auth.state()
    set({ auth, loaded: true })
  },
  signIn: async (provider) => {
    set({ error: null })
    try {
      const auth = await client.auth.signIn(provider)
      set({ auth })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },
  signOut: async () => {
    const auth = await client.auth.signOut()
    set({ auth })
  },
  subscribe: () => client.auth.onChange((auth) => set({ auth }))
}))
