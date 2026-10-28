"""Draws the launcher icons: a pink 8 kg kettlebell. Usage: icon.py <res dir>"""
import os
import sys
from PIL import Image, ImageDraw

RES = sys.argv[1]
IRON, BELL, HANDLE, INK = (29, 24, 27, 255), (214, 51, 122, 255), (251, 246, 248, 255), (255, 255, 255, 255)
S = 4  # supersample


def bell(size, scale, background):
    n = size * S
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if background:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=IRON)
    c, u = n / 2, n * scale / 10000  # u: 1% of the drawing box, which is scale% of the canvas
    hw = 9 * u  # handle stroke width
    d.ellipse([c - 30 * u, c - 44 * u, c + 30 * u, c + 14 * u], outline=HANDLE, width=int(hw))
    d.ellipse([c - 36 * u, c - 22 * u, c + 36 * u, c + 50 * u], fill=BELL)
    # The "8": two stacked rings.
    sw = int(4.5 * u)
    d.ellipse([c - 8 * u, c - 4 * u, c + 8 * u, c + 11 * u], outline=INK, width=sw)
    d.ellipse([c - 10 * u, c + 9 * u, c + 10 * u, c + 28 * u], outline=INK, width=sw)
    return img.resize((size, size), Image.LANCZOS)


densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
for name, f in densities.items():
    out = os.path.join(RES, "mipmap-" + name)
    os.makedirs(out, exist_ok=True)
    bell(int(48 * f), 78, True).save(os.path.join(out, "ic_launcher.png"))
    # Adaptive foreground is 108dp; keep the bell inside the central 66dp safe zone.
    bell(int(108 * f), 58, False).save(os.path.join(out, "ic_launcher_foreground.png"))
