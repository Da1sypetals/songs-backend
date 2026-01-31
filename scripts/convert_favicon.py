#!/usr/bin/env python3
"""
Convert PNG image to favicon.ico with multiple sizes
"""

from PIL import Image
import os
import sys

def convert_to_favicon(png_path, output_path=None):
    """
    Convert PNG to favicon.ico with standard sizes
    """
    if output_path is None:
        output_path = os.path.join(os.path.dirname(png_path), 'favicon.ico')
    
    # Open the source image
    img = Image.open(png_path)
    
    # Convert to RGBA if not already
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Standard favicon sizes
    sizes = [16, 32, 48, 64, 128, 256]
    
    # Create resized versions
    icons = []
    for size in sizes:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        icons.append(resized)
    
    # Save as multi-size ICO
    icons[0].save(
        output_path,
        format='ICO',
        sizes=[(size, size) for size in sizes],
        append_images=icons[1:]
    )
    
    print(f"✅ Favicon created: {output_path}")
    print(f"   Sizes included: {sizes}")
    return output_path

if __name__ == '__main__':
    # Get the project root directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    # Paths
    png_path = os.path.join(project_root, 'icon', 'carrot.png')
    output_path = os.path.join(project_root, 'app', 'favicon.ico')
    
    # Ensure icon directory exists
    if not os.path.exists(png_path):
        print(f"❌ Error: Source image not found at {png_path}")
        sys.exit(1)
    
    # Ensure app directory exists
    app_dir = os.path.dirname(output_path)
    os.makedirs(app_dir, exist_ok=True)
    
    # Convert
    try:
        convert_to_favicon(png_path, output_path)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
