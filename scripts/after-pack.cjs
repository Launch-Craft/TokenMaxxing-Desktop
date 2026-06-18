// electron-builder afterPack hook.
//
// Ad-hoc signs the app (the "-" identity) ONLY when there's no real signing
// identity available. An *unsigned* app on Apple Silicon is rejected by
// Gatekeeper as "damaged and can't be opened"; an ad-hoc signature produces a
// valid-enough signature so the app at least runs (the user just gets the milder
// "unidentified developer" prompt).
//
// When a real Developer ID IS available — passed via CSC_LINK/CSC_NAME, or
// imported into the keychain in CI (apple-actions/import-codesign-certs) and
// found by auto-discovery — electron-builder signs it properly afterwards, so
// this hook does nothing to avoid double-signing.
//
// Proper fix for a clean launch = Apple Developer ID + notarization.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

function hasRealSigningIdentity() {
  // Explicit cert provided → electron-builder will sign for real.
  if (process.env.CSC_LINK || process.env.CSC_NAME) return true
  // Auto-discovery explicitly off (our fast/unsigned path) → no real signing.
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') return false
  // Otherwise, sign for real iff a codesigning identity exists in the keychain.
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8',
    })
    return /\b[0-9A-F]{40}\b/.test(out) && !/0 valid identities found/.test(out)
  } catch {
    return false
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (hasRealSigningIdentity()) return
  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)
  // eslint-disable-next-line no-console
  console.log(`[after-pack] no signing identity → ad-hoc signing ${appName}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
