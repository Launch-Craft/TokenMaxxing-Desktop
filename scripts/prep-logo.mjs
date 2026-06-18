// Turn a white-background logo into a transparent PNG via edge flood-fill, then
// stage it as the icon source + in-app logo. Usage: node scripts/prep-logo.mjs [path]
// If no path given, picks the newest "ChatGPT Image*.png" in ~/Downloads.
import sharp from 'sharp'
import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RES = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'assets')

function findSource() {
  if (process.argv[2]) return process.argv[2]
  const dl = join(homedir(), 'Downloads')
  const imgs = readdirSync(dl)
    .filter((f) => /^ChatGPT Image.*\.png$/i.test(f))
    .map((f) => ({ f, t: statSync(join(dl, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  if (!imgs.length) throw new Error('No "ChatGPT Image*.png" found in ~/Downloads')
  return join(dl, imgs[0].f)
}

const SIZE = 1024
const WHITE = 238 // pixels brighter than this (all channels) count as background

const src = findSource()
console.log('source:', src)

const { data } = await sharp(src)
  .resize(SIZE, SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const isBg = (i) => data[i] >= WHITE && data[i + 1] >= WHITE && data[i + 2] >= WHITE

// Flood-fill transparent from every border pixel through connected near-white.
const stack = []
const seed = (x, y) => {
  const i = (y * SIZE + x) * 4
  if (data[i + 3] !== 0 && isBg(i)) stack.push(i)
}
for (let x = 0; x < SIZE; x++) { seed(x, 0); seed(x, SIZE - 1) }
for (let y = 0; y < SIZE; y++) { seed(0, y); seed(SIZE - 1, y) }

while (stack.length) {
  const i = stack.pop()
  if (data[i + 3] === 0 || !isBg(i)) continue
  data[i + 3] = 0
  const px = (i / 4) % SIZE
  const py = Math.floor(i / 4 / SIZE)
  if (px > 0) stack.push(i - 4)
  if (px < SIZE - 1) stack.push(i + 4)
  if (py > 0) stack.push(i - SIZE * 4)
  if (py < SIZE - 1) stack.push(i + SIZE * 4)
}

const transparent = { r: 0, g: 0, b: 0, alpha: 0 }
// Trim the transparent margin, scale the mark up, and re-center with ~9% padding.
const trimmed = await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png()
  .trim()
  .toBuffer()
const inner = await sharp(trimmed)
  .resize(840, 840, { fit: 'contain', background: transparent })
  .toBuffer()
const png = () =>
  sharp(inner).extend({ top: 92, bottom: 92, left: 92, right: 92, background: transparent }).png()

await png().toFile(join(RES, 'icon-source.png'))
await png().toFile(join(ASSETS, 'logo.png'))
console.log('✓ wrote resources/icon-source.png and src/renderer/assets/logo.png (transparent, centered)')
