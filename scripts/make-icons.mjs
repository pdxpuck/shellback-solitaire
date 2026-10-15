// Generates the PWA icon set from public/icon.svg via sharp (devDep):
//   public/icons/icon-192.png        manifest "any" icon
//   public/icons/icon-512.png        manifest "any" + "maskable" icon
//   public/apple-touch-icon.png      iOS home screen (180x180), flattened
//                                    onto the field color — iOS composites
//                                    transparency onto black otherwise.
// Run via `npm run icons`. Exits non-zero on ANY failure — a silent success
// would ship a stale icon set (freecadcmd lesson).
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..')
const svg = await readFile(join(root, 'public', 'icon.svg'))
const FIELD = '#16324f'

const targets = [
  { out: join(root, 'public', 'icons', 'icon-192.png'), size: 192, flatten: false },
  { out: join(root, 'public', 'icons', 'icon-512.png'), size: 512, flatten: false },
  { out: join(root, 'public', 'apple-touch-icon.png'), size: 180, flatten: true },
]

try {
  await mkdir(join(root, 'public', 'icons'), { recursive: true })
  for (const { out, size, flatten } of targets) {
    let img = sharp(svg).resize(size, size)
    if (flatten) img = img.flatten({ background: FIELD })
    const { size: bytes } = await img.png().toFile(out)
    console.log(`icons: wrote ${relative(root, out)} (${size}x${size}, ${(bytes / 1024).toFixed(1)} kB)`)
  }
} catch (err) {
  console.error('icons: generation failed:', err)
  process.exit(1)
}
