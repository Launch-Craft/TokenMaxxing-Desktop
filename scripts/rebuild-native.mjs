// Rebuilds native modules (better-sqlite3) against Electron's ABI.
// Runs on postinstall but NEVER fails the install: if build tools are missing
// the app transparently falls back to the JSON store (see MemoryDataStore).
import { spawnSync } from 'node:child_process'

const result = spawnSync('electron-builder', ['install-app-deps'], {
  stdio: 'inherit',
  shell: true
})

if (result.status !== 0) {
  console.warn(
    '\n[tokenmaxxing] Native rebuild skipped or failed.\n' +
      '  The app will run using the JSON fallback store (no data loss).\n' +
      '  To enable local SQLite, install build tools and run: npm run rebuild\n'
  )
}

// Always succeed so `npm install` never rolls back.
process.exit(0)
