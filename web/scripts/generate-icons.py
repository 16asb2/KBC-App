#!/usr/bin/env python3
"""Regenerate the app icons in web/public/ from KBC_logo.svg at the repo root.

    python web/scripts/generate-icons.py

Rasterising is done by headless Chrome or Edge (whichever is installed) because
neither Pillow nor cairosvg can read SVG without native cairo, which isn't
available on Windows. Pillow only crops, scales and writes.

Two quirks of KBC_logo.svg are handled here rather than in the file itself, so
the original stays untouched:

  * It is a traced bitmap and carries stray 1px slivers on its left and right
    edges (#151515 and #a4a4a4 paths at x=0 and x=2199). Scaling the raw frame
    would smear those into the icon, so they're trimmed first.
  * Its artwork sits off-centre in the 2200x2200 frame (margins run 174/110/
    140/89 clockwise from left). We crop to the true content box and re-centre.
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
SVG = ROOT / 'KBC_logo.svg'
OUT = ROOT / 'web' / 'public'
RENDER_PX = 2200  # the SVG's native size — no upscaling before we downsample
BG = (0, 0, 0)

BROWSERS = [
    r'C:/Program Files/Google/Chrome/Application/chrome.exe',
    r'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome',
    'chromium',
]


def find_browser() -> str:
    for b in BROWSERS:
        if Path(b).exists() or shutil.which(b):
            return b
    sys.exit('No Chrome/Edge found — needed to rasterise the SVG. Edit BROWSERS.')


def rasterise(tmp: Path) -> Image.Image:
    """Screenshot the SVG at native size via headless Chrome."""
    shutil.copy(SVG, tmp / SVG.name)
    (tmp / 'render.html').write_text(
        '<!doctype html><meta charset="utf-8"><style>'
        '*{margin:0;padding:0;border:0}'
        f'html,body{{width:{RENDER_PX}px;height:{RENDER_PX}px;overflow:hidden;background:#000}}'
        f'img{{width:{RENDER_PX}px;height:{RENDER_PX}px;display:block}}'
        f'</style><img src="{SVG.name}">',
        encoding='utf-8',
    )
    shot = tmp / 'render.png'
    subprocess.run(
        [find_browser(), '--headless=new', '--disable-gpu', '--hide-scrollbars',
         '--force-device-scale-factor=1', f'--window-size={RENDER_PX},{RENDER_PX}',
         f'--screenshot={shot}', (tmp / 'render.html').as_uri()],
        check=True, capture_output=True,
    )
    return Image.open(shot).convert('RGB')


def artwork(full: Image.Image) -> Image.Image:
    """Trim the traced edge slivers, then crop to the real content box."""
    trimmed = full.crop((6, 6, full.width - 6, full.height - 6))
    mask = ImageChops.difference(trimmed, Image.new('RGB', trimmed.size, BG))
    mask = mask.convert('L').point(lambda v: 255 if v > 28 else 0)
    return trimmed.crop(mask.getbbox())


def tile(art: Image.Image, size: int, fill: float) -> Image.Image:
    """Centre `art` on a square black tile, its longest side `fill` of the tile.
    The padding is invisible against the logo's own black background, so the
    result reads as one solid square."""
    scale = min(size * fill / art.width, size * fill / art.height)
    w, h = max(1, round(art.width * scale)), max(1, round(art.height * scale))
    out = Image.new('RGB', (size, size), BG)
    out.paste(art.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
    return out


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        art = artwork(rasterise(Path(td)))
    print(f'artwork {art.width}x{art.height} from {SVG.name}')

    # Near full-bleed, with a hair of margin so nothing kisses the tile edge.
    for name, size in [('pwa-64x64.png', 64), ('pwa-192x192.png', 192),
                       ('pwa-512x512.png', 512), ('apple-touch-icon-180x180.png', 180),
                       ('kbc-logo.png', 512)]:  # kbc-logo is the in-app header/login mark
        tile(art, size, 0.92).save(OUT / name, optimize=True)
        print('wrote', name)

    # Android crops this to a circle or squircle, so hold the artwork inside the
    # 80% safe zone. The X's arm tips still cross it, but they read as running
    # off the edge either way.
    tile(art, 512, 0.70).save(OUT / 'maskable-icon-512x512.png', optimize=True)
    print('wrote maskable-icon-512x512.png')

    # Multi-resolution, so tabs and bookmarks each pick a native size.
    tile(art, 256, 0.92).save(OUT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print('wrote favicon.ico (16/32/48/64)')


if __name__ == '__main__':
    main()
