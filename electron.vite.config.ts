import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // electron-vite only exposes VITE_* vars to the renderer. The main process
  // reads process.env.VITE_API_BASE_URL / VITE_APP_PROTOCOL, so we statically
  // inject them into the main bundle at build/dev time from the .env file.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const mainDefine = {
    'process.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL ?? ''),
    'process.env.VITE_APP_PROTOCOL': JSON.stringify(env.VITE_APP_PROTOCOL ?? 'tokenmaxxing')
  }

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias: {
          '@shared': resolve('src/shared'),
          '@main': resolve('src/main')
        }
      },
      define: mainDefine,
      build: {
        rollupOptions: {
          // better-sqlite3: native module (optional). sql.js: ships a .wasm that
          // must be resolved from node_modules at runtime. Keep both external.
          external: ['better-sqlite3', 'sql.js'],
          input: { index: resolve('src/main/index.ts') }
        }
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias: { '@shared': resolve('src/shared') }
      },
      define: mainDefine,
      build: {
        rollupOptions: {
          input: { index: resolve('src/preload/index.ts') }
        }
      }
    },
    renderer: {
      root: 'src/renderer',
      resolve: {
        alias: {
          '@': resolve('src/renderer'),
          '@shared': resolve('src/shared')
        }
      },
      plugins: [react()],
      build: {
        rollupOptions: {
          input: { index: resolve('src/renderer/index.html') }
        }
      }
    }
  }
})
