#!/usr/bin/env python3
"""Generate placeholder icons for the extension"""

try:
    from PIL import Image, ImageDraw, ImageFont
    
    def create_icon(size):
        # Create image with gradient-like background
        img = Image.new('RGB', (size, size), color='#0077b5')
        draw = ImageDraw.Draw(img)
        
        # Add text
        font_size = int(size * 0.5)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except:
            font = ImageFont.load_default()
        
        text = "JP"
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        x = (size - text_width) // 2
        y = (size - text_height) // 2 - bbox[1]
        
        draw.text((x, y), text, fill='white', font=font)
        
        return img
    
    # Generate icons
    for size in [16, 48, 128]:
        icon = create_icon(size)
        icon.save(f'icon{size}.png')
        print(f'Generated icon{size}.png')
    
    print('All icons generated successfully!')

except ImportError:
    print('PIL not installed. Creating simple icons...')
    # Fallback: create minimal icons without PIL
    import base64
    
    # Minimal 16x16 PNG (solid blue square with white text)
    icons_b64 = {
        16: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5QEGESwSQw==',
        48: 'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5QEGESwSQw==',
        128: 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5QEGESwSQw=='
    }
    
    print('Install Pillow for better icons: pip install Pillow')
    print('For now, open create-icons.html in a browser to generate icons.')
