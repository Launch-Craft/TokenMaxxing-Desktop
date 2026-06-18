// Dev-only: the `npm run dev` Dock label comes from the bundled Electron.app's
// Info.plist (so it reads "Electron"). This rewrites it to "TokenMaxxing" for a
// correct Dock name in development. Packaged builds already use productName.
// Safe + idempotent; a no-op if the plist isn't found.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const plist = join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'Info.plist')
const NAME = 'TokenMaxxing'

if (!existsSync(plist)) {
  console.log('[patch-dev-name] Electron.app not found; skipping')
  process.exit(0)
}

const set = (key) => {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${NAME}`, plist])
  } catch {
    try {
      execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${NAME}`, plist])
    } catch {
      /* ignore */
    }
  }
}

set('CFBundleName')
set('CFBundleDisplayName')

// macOS caches bundle names in LaunchServices — force it to re-read so the Dock
// shows the new name on next launch (touch the bundle + re-register).
const appBundle = join(root, 'node_modules', 'electron', 'dist', 'Electron.app')
const lsregister =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
try {
  execFileSync('/usr/bin/touch', [appBundle])
} catch {
  /* ignore */
}
try {
  execFileSync(lsregister, ['-f', appBundle])
} catch {
  /* ignore */
}
console.log(`[patch-dev-name] Dock name set to "${NAME}" + LaunchServices re-registered`)
