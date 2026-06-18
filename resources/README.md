# App resources

Place packaging assets here (referenced by `electron-builder.yml`):

- `icon.icns` — macOS app icon (1024×1024 source)
- `icon.ico` — Windows app icon
- `icon.png` — Linux app icon (512×512)
- `entitlements.mac.plist` — macOS hardened-runtime entitlements (included)

Until real icons are added, electron-builder falls back to the default Electron
icon. Generate all formats from a single 1024×1024 PNG with a tool like
[`electron-icon-builder`](https://github.com/safu9/electron-icon-builder).
