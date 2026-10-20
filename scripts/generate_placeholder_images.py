"""Generate the placeholder imagery used by the ARCH concept site.

The Lovable import shipped two zero-byte image files. Rather than commit broken
assets, this script renders clearly-labelled, neutral placeholder artwork so the
layout can be reviewed in a browser. Replace the generated files with real
photography when ARCH supplies it — the filenames and dimensions stay the same.

Usage:
    uv run --with pillow python scripts/generate_placeholder_images.py
"""

from __future__ import annotations

import math
import pathlib
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "src" / "assets"

INK = (13, 14, 13)
INK_SOFT = (24, 26, 23)
WALL = (33, 36, 32)
WALL_DARK = (21, 23, 20)
FLOOR = (17, 18, 17)
LIME = (200, 245, 66)
CORAL = (255, 107, 74)
BLUE = (74, 168, 255)
YELLOW = (255, 210, 63)
CREAM = (242, 241, 236)


def _hold(draw: ImageDraw.ImageDraw, x: float, y: float, w: float, h: float, colour, angle: float) -> None:
    """Draw a rounded, slightly rotated climbing hold."""
    layer = Image.new("RGBA", (int(w * 2), int(h * 2)), (0, 0, 0, 0))
    local = ImageDraw.Draw(layer)
    local.rounded_rectangle(
        (0, 0, int(w * 2) - 1, int(h * 2) - 1),
        radius=int(min(w, h) * 0.55),
        fill=colour + (235,),
    )
    layer = layer.rotate(angle, resample=Image.BICUBIC, expand=False)
    draw._image.paste(layer, (int(x - w), int(y - h)), layer)


def build_gym(width: int = 1920, height: int = 1024) -> Image.Image:
    random.seed(7)
    image = Image.new("RGB", (width, height), INK)
    draw = ImageDraw.Draw(image)

    # Back wall and floor.
    draw.rectangle((0, 0, width, int(height * 0.72)), fill=WALL_DARK)
    draw.rectangle((0, int(height * 0.72), width, height), fill=FLOOR)

    # Angled climbing wall with panel seams.
    wall_top = int(height * 0.06)
    wall_bottom = int(height * 0.72)
    draw.polygon(
        [(0, wall_top), (width, int(height * 0.16)), (width, wall_bottom), (0, wall_bottom)],
        fill=WALL,
    )
    for index in range(9):
        x = int(width * (index / 8))
        draw.line(
            [(x, wall_top + int((x / width) * height * 0.1)), (x, wall_bottom)],
            fill=(28, 31, 27),
            width=3,
        )
    draw.line([(0, wall_bottom), (width, wall_bottom)], fill=(40, 44, 38), width=6)

    # Ceiling lights.
    for index in range(4):
        cx = int(width * (0.15 + index * 0.23))
        cy = int(height * 0.05)
        glow = Image.new("RGB", (width, height), INK)
        ImageDraw.Draw(glow).ellipse(
            (cx - 130, cy - 70, cx + 130, cy + 70), fill=(70, 78, 60)
        )
        glow = glow.filter(ImageFilter.GaussianBlur(60))
        image = Image.blend(image, Image.blend(image, glow, 0.55), 0.7)
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((cx - 60, cy - 7, cx + 60, cy + 7), radius=7, fill=(210, 224, 170))

    # Holds scattered over the wall.
    palette = [LIME, CORAL, BLUE, YELLOW]
    for index in range(150):
        x = random.uniform(width * 0.03, width * 0.97)
        y = random.uniform(height * 0.12, height * 0.68)
        w = random.uniform(26, 74)
        h = w * random.uniform(0.34, 0.5)
        _hold(draw, x, y, w, h, palette[index % len(palette)], random.uniform(-30, 30))

    # Padded floor.
    draw.rectangle((0, wall_bottom, width, wall_bottom + 26), fill=(45, 49, 43))

    # Vignette.
    vignette = Image.new("L", (width, height), 0)
    ImageDraw.Draw(vignette).ellipse(
        (-int(width * 0.25), -int(height * 0.35), int(width * 1.25), int(height * 1.35)), fill=255
    )
    vignette = vignette.filter(ImageFilter.GaussianBlur(220))
    image = Image.composite(image, Image.new("RGB", (width, height), INK), vignette)

    return image.filter(ImageFilter.SMOOTH)


def build_shoes(size: int = 1024) -> Image.Image:
    image = Image.new("RGB", (size, size), INK)
    draw = ImageDraw.Draw(image)

    # Soft studio backdrop.
    for radius, alpha in ((size * 0.55, 40), (size * 0.38, 55), (size * 0.22, 70)):
        layer = Image.new("RGB", (size, size), INK)
        ImageDraw.Draw(layer).ellipse(
            (
                size / 2 - radius,
                size / 2 - radius * 0.8,
                size / 2 + radius,
                size / 2 + radius * 0.8,
            ),
            fill=(30, 33, 28),
        )
        layer = layer.filter(ImageFilter.GaussianBlur(70))
        image = Image.blend(image, layer, alpha / 255)
    draw = ImageDraw.Draw(image)

    def shoe(cx: float, cy: float, scale: float, rotation: float, body, accent) -> None:
        """Side profile of a downturned climbing shoe."""
        w, h = 460 * scale, 250 * scale
        pad = int(max(w, h) * 1.3)
        layer = Image.new("RGBA", (pad * 2, pad * 2), (0, 0, 0, 0))
        local = ImageDraw.Draw(layer)
        ox, oy = pad, pad

        # Upper: heel at the left, downturned toe at the right.
        local.polygon(
            [
                (ox - w * 0.46, oy + h * 0.28),
                (ox - w * 0.44, oy - h * 0.12),
                (ox - w * 0.28, oy - h * 0.36),
                (ox + w * 0.02, oy - h * 0.42),
                (ox + w * 0.28, oy - h * 0.36),
                (ox + w * 0.46, oy - h * 0.06),
                (ox + w * 0.44, oy + h * 0.26),
                (ox + w * 0.18, oy + h * 0.40),
                (ox - w * 0.20, oy + h * 0.40),
            ],
            fill=body + (255,),
        )
        # Sole.
        local.polygon(
            [
                (ox - w * 0.46, oy + h * 0.28),
                (ox + w * 0.44, oy + h * 0.26),
                (ox + w * 0.18, oy + h * 0.42),
                (ox - w * 0.20, oy + h * 0.42),
            ],
            fill=(16, 17, 16, 255),
        )
        # Downturned toe rand.
        local.polygon(
            [
                (ox + w * 0.16, oy - h * 0.36),
                (ox + w * 0.46, oy - h * 0.06),
                (ox + w * 0.44, oy + h * 0.26),
                (ox + w * 0.20, oy + h * 0.10),
            ],
            fill=accent + (255,),
        )
        # Heel patch.
        local.polygon(
            [
                (ox - w * 0.44, oy - h * 0.12),
                (ox - w * 0.28, oy - h * 0.36),
                (ox - w * 0.34, oy + h * 0.30),
                (ox - w * 0.46, oy + h * 0.28),
            ],
            fill=accent + (255,),
        )
        # Hook-and-loop straps across the instep.
        for offset in (-0.18, 0.02):
            local.rounded_rectangle(
                (
                    ox - w * 0.24,
                    oy + h * offset - h * 0.045,
                    ox + w * 0.14,
                    oy + h * offset + h * 0.045,
                ),
                radius=int(h * 0.045),
                fill=accent + (255,),
            )
        # Lace detail.
        for index in range(3):
            y = oy - h * 0.22 + index * h * 0.10
            local.ellipse(
                (ox - w * 0.16, y - h * 0.022, ox - w * 0.12, y + h * 0.022),
                fill=(210, 214, 205, 255),
            )

        layer = layer.rotate(rotation, resample=Image.BICUBIC)
        shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).ellipse(
            (ox - w * 0.48, oy + h * 0.36, ox + w * 0.48, oy + h * 0.62), fill=(0, 0, 0, 150)
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(20))
        shadow = shadow.rotate(rotation, resample=Image.BICUBIC)
        image.paste(shadow, (int(cx - pad), int(cy - pad)), shadow)
        image.paste(layer, (int(cx - pad), int(cy - pad)), layer)

    shoe(size * 0.46, size * 0.58, 1.0, -8, (44, 48, 41), LIME)
    shoe(size * 0.60, size * 0.36, 0.72, 10, (32, 35, 30), CORAL)

    # Subtle vignette.
    vignette = Image.new("L", (size, size), 0)
    ImageDraw.Draw(vignette).ellipse(
        (-size * 0.2, -size * 0.2, size * 1.2, size * 1.2), fill=255
    )
    vignette = vignette.filter(ImageFilter.GaussianBlur(140))
    image = Image.composite(image, Image.new("RGB", (size, size), INK), vignette)
    return image.filter(ImageFilter.SMOOTH)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    gym = build_gym()
    gym.save(ASSETS / "arch-gym.jpg", quality=86, optimize=True)
    shoes = build_shoes()
    shoes.save(ASSETS / "climbing-shoes.jpg", quality=86, optimize=True)
    print(f"wrote {ASSETS / 'arch-gym.jpg'} ({gym.size})")
    print(f"wrote {ASSETS / 'climbing-shoes.jpg'} ({shoes.size})")


if __name__ == "__main__":
    main()
