#!/usr/bin/env python3
"""
Convert high-res PNG to multi-size favicon.ico with optimal clarity
"""

from PIL import Image
import io
import struct
import os
import sys


def create_ico_file(images, output_path):
    """
    Create a multi-size ICO file from a list of PIL Images.
    Uses PNG format for each size for best quality.
    """
    num_images = len(images)
    
    # ICO Header (6 bytes): Reserved + Type + Count
    header = struct.pack('<HHH', 0, 1, num_images)
    
    # Calculate directory size
    directory_size = 16 * num_images
    header_size = 6 + directory_size
    
    # Prepare directory entries and image data
    directory = b''
    image_data = b''
    offset = header_size
    
    for img in images:
        # Convert to PNG bytes for storage
        png_buffer = io.BytesIO()
        img.save(png_buffer, format='PNG', optimize=False)
        png_bytes = png_buffer.getvalue()
        size_in_bytes = len(png_bytes)
        
        width, height = img.size
        # ICO format: 0 means 256
        w = 0 if width >= 256 else width
        h = 0 if height >= 256 else height
        
        # Directory Entry (16 bytes)
        entry = struct.pack('<BBBBHHII', 
            w, h, 0, 0,       # width, height, colors, reserved
            1, 32,            # planes, bpp
            size_in_bytes,
            offset
        )
        directory += entry
        image_data += png_bytes
        offset += size_in_bytes
    
    # Write the complete ICO file
    with open(output_path, 'wb') as f:
        f.write(header)
        f.write(directory)
        f.write(image_data)
    
    return output_path


def create_crisp_favicon(source_path, output_path):
    """
    Create a high-quality favicon from source image.
    """
    source = Image.open(source_path)
    print(f"Source image: {source.size[0]}x{source.size[1]}, mode: {source.mode}")
    
    if source.mode != 'RGBA':
        source = source.convert('RGBA')
    
    sizes = [16, 32, 48, 64, 128, 256]
    
    icons = []
    for size in sizes:
        resized = source.resize((size, size), Image.Resampling.LANCZOS)
        icons.append(resized)
        print(f"  ✓ Generated {size}x{size}")
    
    create_ico_file(icons, output_path)
    
    file_size = os.path.getsize(output_path)
    print(f"\n✅ Favicon created: {output_path}")
    print(f"   Sizes: {sizes}")
    print(f"   File size: {file_size / 1024:.1f} KB")
    
    return output_path


if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    source_path = os.path.join(project_root, 'icon', 'carrot.png')
    output_path = os.path.join(project_root, 'public', 'favicon.ico')
    
    if not os.path.exists(source_path):
        print(f"❌ Error: Source image not found at {source_path}")
        sys.exit(1)
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    try:
        create_crisp_favicon(source_path, output_path)
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
