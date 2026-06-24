#!/usr/bin/env bash
#
# Build + sign + notarize + publish a macOS release FROM YOUR MAC.
#
# Why local instead of CI? Signing/notarization on GitHub-hosted macOS runners
# intermittently hangs in `codesign` — it blocks on keychain access and on
# Apple's timestamp server (timestamp.apple.com), neither of which behaves on a
# headless runner. Your own Mac has the Developer ID cert in its login keychain
# and a normal network connection, so signing + notarization are fast and
# reliable here.
#
# One-time setup:
#   1. Confirm your cert is present:  security find-identity -v -p codesigning
#      (you should see "Developer ID Application: …")
#   2. cp .env.release.example .env.release   # then fill in the Apple creds + token
#
# Usage:
#   npm run release:local          # or:  bash scripts/release-local.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Load credentials from .env.release if present (gitignored).
if [ -f .env.release ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.release
  set +a
fi

# No token provided? Borrow one from the `gh` CLI if you're logged in
# (run `gh auth login` once). This means you never have to paste a token.
if [ -z "${GH_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  GH_TOKEN="$(gh auth token 2>/dev/null || true)"
  export GH_TOKEN
  [ -n "$GH_TOKEN" ] && echo "→ Using GitHub token from the gh CLI."
fi

fail=0
for v in APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID; do
  if [ -z "${!v:-}" ]; then
    echo "✗ $v is not set (add it to .env.release)"
    fail=1
  fi
done

if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
  echo "✗ No 'Developer ID Application' certificate found in your keychain."
  echo "  Import your .p12 (double-click it) or check Keychain Access."
  fail=1
fi

if [ "$fail" = "1" ]; then
  echo "→ Fix the issues above and re-run."
  exit 1
fi

if [ -n "${GH_TOKEN:-}" ]; then
  publish="always"
  echo "→ GH_TOKEN set → will publish the release to GitHub."
else
  publish="never"
  echo "⚠ GH_TOKEN not set → building + notarizing locally WITHOUT publishing."
  echo "  Upload dist/TokenMaxxing.dmg to a GitHub release manually when ready."
fi

version="$(node -p "require('./package.json').version")"
echo "→ Releasing v${version} for macOS (arm64)…"

echo "→ Building bundles…"
npm run build

# The cert is auto-discovered from your login keychain — do NOT set CSC_LINK.
# APPLE_* in the environment triggers notarization (scripts/notarize.cjs).
echo "→ Signing + notarizing + packaging…"
npx electron-builder --mac --publish "$publish"

echo ""
echo "✓ Done. Signed + notarized artifacts are in dist/ (TokenMaxxing.dmg)."
if [ "$publish" = "always" ]; then
  echo "✓ Published to GitHub Releases as v${version}."
fi
