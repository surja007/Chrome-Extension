#!/usr/bin/env python3
"""Generate the extension icons (icon16/48/128.png).

Primary path: Pillow — renders the "JP" logo on the JobPilot teal background.
Fallback: if icon.png (128x128) already exists, scale it down with Pillow.
Without Pillow, prints manual instructions (open create-icons.html in Chrome).
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BRAND_COLOR = '#0e5a6b'


def create_icon(size):
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new('RGB', (size, size), color=BRAND_COLOR)
    draw = ImageDraw.Draw(img)

    font_size = int(size * 0.5)
    font = None
    for candidate in (
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    ):
        try:
            font = ImageFont.truetype(candidate, font_size)
            break
        except OSError:
            continue
    if font is None:
        try:
            font = ImageFont.load_default(size=font_size)
        except TypeError:
            font = ImageFont.load_default()

    text = 'JP'
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = (size - text_width) // 2 - bbox[0]
        y = (size - text_height) // 2 - bbox[1]
    except AttributeError:
        text_width, text_height = draw.textsize(text, font=font)
        x = (size - text_width) // 2
        y = (size - text_height) // 2

    draw.text((x, y), text, fill='white', font=font)
    return img


def main():
    try:
        from PIL import Image
    except ImportError:
        print('Pillow not installed. Run: pip install Pillow')
        print('Alternatively open create-icons.html in Chrome to generate icons.')
        sys.exit(1)

    icon_png = os.path.join(HERE, 'icon.png')

    for size in (16, 48, 128):
        out_path = os.path.join(HERE, f'icon{size}.png')
        if size == 128 and os.path.exists(icon_png):
            # Reuse the existing 128x128 artwork
            Image.open(icon_png).convert('RGBA').save(out_path, optimize=True)
        else:
            create_icon(size).save(out_path, optimize=True)
        print(f'Generated {out_path}')

    print('All icons generated successfully!')


if __name__ == '__main__':
    main()
