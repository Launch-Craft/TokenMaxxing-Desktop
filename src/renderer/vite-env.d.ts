/// <reference types="vite/client" />

import type { TokenMaxxingApi } from '@shared/ipc'

declare global {
  interface Window {
    /** Exposed by the preload bridge. May be undefined in a plain browser. */
    api?: TokenMaxxingApi
  }
}

export {}
