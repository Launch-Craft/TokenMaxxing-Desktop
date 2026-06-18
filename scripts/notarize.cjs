// electron-builder afterSign hook — notarizes the (Developer ID-signed) mac app
// with Apple, then staples the ticket so it opens cleanly on any Mac.
//
// Runs only when notarization creds are present in the environment:
//   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
// Otherwise it skips (so ad-hoc / unsigned builds still succeed).
const { notarize } = require('@electron/notarize')
const path = require('node:path')

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID
  if (!appleId || !appleIdPassword || !teamId) {
    // eslint-disable-next-line no-console
    console.log('[notarize] APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set — skipping')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  // eslint-disable-next-line no-console
  console.log(`[notarize] submitting ${appName}.app to Apple…`)
  await notarize({ appPath, appleId, appleIdPassword, teamId })
  // eslint-disable-next-line no-console
  console.log('[notarize] notarized + stapled ✓')
}
