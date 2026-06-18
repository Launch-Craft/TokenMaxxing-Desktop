// Regenerate app icons with a TRANSPARENT background (sharp renders SVG via
// librsvg, unlike qlmanage which composites onto white).
//
//   To use your exact logo: drop a square PNG (≥1024px, transparent) at
//   resources/icon-source.png, then run `npm run icons`.
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RES = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')
const transparent = { r: 0, g: 0, b: 0, alpha: 0 }

function source(file) {
  const png = join(RES, 'icon-source.png')
  return existsSync(png) ? readFileSync(png) : readFileSync(join(RES, file))
}

async function render(input, size, out) {
  await sharp(input, { density: 384 })
    .resize(size, size, { fit: 'contain', background: transparent })
    .png()
    .toFile(out)
}

const icon = source('icon.svg')

// 1) 1024 master PNG (transparent)
await render(icon, 1024, join(RES, 'icon.png'))

// 2) macOS .icns from a full iconset
const set = join(RES, 'icon.iconset')
rmSync(set, { recursive: true, force: true })
mkdirSync(set)
for (const s of [16, 32, 128, 256, 512]) {
  await render(icon, s, join(set, `icon_${s}x${s}.png`))
  await render(icon, s * 2, join(set, `icon_${s}x${s}@2x.png`))
}
execFileSync('iconutil', ['-c', 'icns', set, '-o', join(RES, 'icon.icns')])
rmSync(set, { recursive: true, force: true })

console.log('✓ icons regenerated with transparent background: icon.png, icon.icns')
