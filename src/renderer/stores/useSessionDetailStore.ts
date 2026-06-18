import { create } from 'zustand'
import type { Session } from '@shared/types'

interface SessionDetailState {
  session: Session | null
  open: boolean
  show: (session: Session) => void
  close: () => void
}

/** Holds the session shown in the detail dialog (opened from any session row). */
export const useSessionDetailStore = create<SessionDetailState>((set) => ({
  session: null,
  open: false,
  show: (session) => set({ session, open: true }),
  close: () => set({ open: false })
}))
