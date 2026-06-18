import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { SessionDetail } from '@/components/dashboard/SessionDetail'

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const { pathname } = useLocation()
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TitleBar />
        <main className="relative flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="relative mx-auto w-full max-w-[1180px] px-7 py-7"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <SessionDetail />
    </div>
  )
}
