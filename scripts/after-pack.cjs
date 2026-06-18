// electron-builder afterPack hook.
//
// We don't have an Apple Developer ID, so electron-builder skips signing
// (CSC_IDENTITY_AUTO_DISCOVERY=false). An *unsigned* app on Apple Silicon is
// rejected by Gatekeeper as "damaged and can't be opened". Ad-hoc signing (the
// "-" identity) produces a valid-enough signature so the app runs — the user
// just gets the milder "unidentified developer" prompt (right-click → Open).
//
// Proper fix for a clean launch = Apple Developer ID + notarization.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  // If a real Developer ID cert is provided, electron-builder will sign properly
  // afterwards — skip ad-hoc signing so we don't interfere.
  if (process.env.CSC_LINK || process.env.CSC_NAME) return
  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)
  // eslint-disable-next-line no-console
  console.log(`[after-pack] ad-hoc signing ${appName}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
