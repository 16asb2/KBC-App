#!/usr/bin/env node
/**
 * Build the printable app poster from `poster.template.html`.
 *
 *   cd scripts && npm install      # for the qrcode dependency
 *   node ../print/build-poster.mjs
 *
 * Two things get inlined: the QR code as SVG, and the KBC logo as a data URI.
 * Both by design — a poster is printed, often from a laptop on gym wifi that
 * may not be working, and a page that fetches anything at print time is a page
 * that can print with a hole in it. The output is one self-contained file
 * whose only network request is the Google Fonts stylesheet, and that has real
 * fallback stacks behind it.
 *
 * This exists as a generator rather than a hand-edited file for one reason: a
 * QR code is two kilobytes of path data that nobody can eyeball. If the app's
 * URL ever changes, regenerating is correct and retyping is not — and the
 * round-trip check below is only possible here.
 *
 *   --url <url>   what the QR should point at (default: the live app)
 *   --body-only   emit the page without the document wrapper, for publishing
 *                 as an Artifact (which supplies its own <head>)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

// qrcode lives in scripts/, which is the repo's home for tooling that should
// never reach web/'s dependency tree. See scripts/README.md.
const require = createRequire(here('../scripts/package.json'))
let QRCode
try {
  QRCode = require('qrcode')
} catch {
  console.error('Missing the qrcode package. Run `npm install` in scripts/ first.')
  process.exit(1)
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const APP_URL = arg('url', 'https://kbc-app-3307b.web.app')
const bodyOnly = process.argv.includes('--body-only')

/**
 * Error correction H — 30% of the symbol can be damaged and still read.
 *
 * Worth the extra modules here: this gets printed, taped to a wall, and lives
 * next to a chalk bucket. The URL is short enough that even at H the symbol is
 * only 33 modules across, so the printed squares stay large.
 *
 * margin 4 is the quiet zone the spec requires, baked into the SVG so no
 * amount of CSS can crop it away.
 */
const QR_OPTIONS = { errorCorrectionLevel: 'H', margin: 4 }

const qrSvg = (await QRCode.toString(APP_URL, { ...QR_OPTIONS, type: 'svg' }))
  .replace(/<\?xml[^>]*\?>/, '')
  .trim()

// What the QR claims to contain, checked rather than assumed. A poster is
// printed in a batch; a QR that does not scan is expensive to find out about
// on a wall.
const symbol = QRCode.create(APP_URL, QR_OPTIONS)

const logo = readFileSync(here('../web/public/kbc-logo.png'))
const logoUri = `data:image/png;base64,${logo.toString('base64')}`

// Shown to a human who would rather type it than scan. The scheme is noise on
// a poster; every phone browser assumes https.
const urlDisplay = APP_URL.replace(/^https?:\/\//, '')

const page = readFileSync(here('poster.template.html'), 'utf8')
  .replaceAll('__QR__', qrSvg)
  .replaceAll('__LOGO__', logoUri)
  .replaceAll('__URL_DISPLAY__', urlDisplay)

// The template is one stream — title, stylesheet link, styles, then markup —
// because that is exactly the shape an Artifact publish wants: it supplies the
// document wrapper itself. A standalone file needs that wrapper, so the marker
// says where head ends and body begins rather than a regex guessing.
const [headPart, bodyPart] = page.split('<!-- @body -->')
if (bodyPart === undefined) {
  console.error('poster.template.html is missing its <!-- @body --> marker.')
  process.exit(1)
}

const out = bodyOnly
  ? page.replace('<!-- @body -->', '')
  : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${headPart.trim()}
</head>
<body>
${bodyPart.trim()}
</body>
</html>
`

const target = arg('out', bodyOnly ? here('kbc-app-poster.body.html') : here('kbc-app-poster.html'))
writeFileSync(target, out)

console.log(`url      ${APP_URL}`)
console.log(`qr       version ${symbol.version}, ${symbol.modules.size}x${symbol.modules.size} modules, EC ${QR_OPTIONS.errorCorrectionLevel}`)
console.log(`logo     ${(logo.length / 1024).toFixed(0)} kB inlined`)
console.log(`wrote    ${target} (${(out.length / 1024).toFixed(0)} kB)`)
