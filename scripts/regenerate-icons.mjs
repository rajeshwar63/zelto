// scripts/regenerate-icons.mjs
// Regenerates all derived icon assets from public/zelto-logo-master.png.
// Run with: node scripts/regenerate-icons.mjs
//
// If the master logo is updated, re-run this script and commit the output.

import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const master = resolve(repoRoot, 'public/zelto-logo-master.png')

if (!existsSync(master)) {
  console.error(`Master logo not found at ${master}`)
  console.error('Drop your 1024x1024 transparent PNG there, then re-run.')
  process.exit(1)
}

const BG_COLOR = '#ffffff'

const androidDensities = [
  { name: 'mdpi', square: 48, foreground: 108 },
  { name: 'hdpi', square: 72, foreground: 162 },
  { name: 'xhdpi', square: 96, foreground: 216 },
  { name: 'xxhdpi', square: 144, foreground: 324 },
  { name: 'xxxhdpi', square: 192, foreground: 432 },
]

async function ensureDir(path) {
  await mkdir(path, { recursive: true })
}

async function writeFlatSquare(outPath, size) {
  await ensureDir(dirname(outPath))
  const inner = Math.round(size * 0.70)
  const logoBuffer = await sharp(master)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite([{ input: logoBuffer, gravity: 'center' }])
    .png()
    .toFile(outPath)
}

async function writeTransparentForeground(outPath, size) {
  await ensureDir(dirname(outPath))
  const inner = Math.round(size * 0.60)
  const logoBuffer = await sharp(master)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logoBuffer, gravity: 'center' }])
    .png()
    .toFile(outPath)
}

async function writeMaskable(outPath, size) {
  await ensureDir(dirname(outPath))
  const inner = Math.round(size * 0.60)
  const logoBuffer = await sharp(master)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite([{ input: logoBuffer, gravity: 'center' }])
    .png()
    .toFile(outPath)
}

async function writeAny(outPath, size) {
  await writeFlatSquare(outPath, size)
}

for (const { name, square, foreground } of androidDensities) {
  const base = `android/app/src/main/res/mipmap-${name}`
  await writeFlatSquare(resolve(repoRoot, `${base}/ic_launcher.png`), square)
  await writeFlatSquare(resolve(repoRoot, `${base}/ic_launcher_round.png`), square)
  await writeTransparentForeground(
    resolve(repoRoot, `${base}/ic_launcher_foreground.png`),
    foreground,
  )
  console.log(`\u2713 ${name}: ${square}x${square}, fg ${foreground}x${foreground}`)
}

const adaptiveDir = resolve(
  repoRoot,
  'android/app/src/main/res/mipmap-anydpi-v26',
)
await ensureDir(adaptiveDir)

const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`
await writeFile(resolve(adaptiveDir, 'ic_launcher.xml'), adaptiveXml)
await writeFile(resolve(adaptiveDir, 'ic_launcher_round.xml'), adaptiveXml)
console.log('\u2713 adaptive-icon XML (mipmap-anydpi-v26)')

const valuesDir = resolve(repoRoot, 'android/app/src/main/res/values')
await ensureDir(valuesDir)
const bgXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG_COLOR}</color>
</resources>
`
await writeFile(resolve(valuesDir, 'ic_launcher_background.xml'), bgXml)
console.log('\u2713 ic_launcher_background color resource')

await writeAny(resolve(repoRoot, 'public/icons/icon-192.png'), 192)
await writeAny(resolve(repoRoot, 'public/icons/icon-512.png'), 512)
await writeMaskable(resolve(repoRoot, 'public/icons/icon-512-maskable.png'), 512)
await writeAny(resolve(repoRoot, 'public/zelto-icon-512.png'), 512)
await writeAny(resolve(repoRoot, 'public/apple-touch-icon.png'), 180)
await writeAny(resolve(repoRoot, 'public/favicon-96x96.png'), 96)
console.log('\u2713 PWA icons (192/512/512-maskable/apple-touch/favicon-96)')

const icoSizes = [16, 32, 48]
const icoBuffers = []
for (const size of icoSizes) {
  const buf = await sharp(master)
    .resize(size, size, { fit: 'contain', background: BG_COLOR })
    .flatten({ background: BG_COLOR })
    .png()
    .toBuffer()
  icoBuffers.push(buf)
}
const icoFinal = await pngToIco(icoBuffers)
await writeFile(resolve(repoRoot, 'public/favicon.ico'), icoFinal)
console.log('\u2713 favicon.ico (16/32/48)')

console.log('\nAll icons regenerated. Review them visually before committing.')
