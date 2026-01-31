#!/usr/bin/env python3
"""
Import songs from songs.json to Redis directly
"""

import json
import uuid
import os
import sys
from datetime import datetime

# Add parent directory to path to import modules if needed
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def get_redis_client():
    """Create Redis client from environment variables"""
    try:
        from upstash_redis import Redis
    except ImportError:
        print("❌ Error: upstash-redis not installed")
        print("   Run: pip install upstash-redis")
        sys.exit(1)
    
    # Load environment variables from .env.local
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env.local')
    
    url = None
    token = None
    
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line.startswith('UPSTASH_REDIS_REST_URL='):
                    url = line.split('=', 1)[1].strip().strip('"').strip("'")
                elif line.startswith('UPSTASH_REDIS_REST_TOKEN='):
                    token = line.split('=', 1)[1].strip().strip('"').strip("'")
    
    if not url or not token:
        print("❌ Error: Redis credentials not found in .env.local")
        print("   Please ensure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set")
        sys.exit(1)
    
    return Redis(url=url, token=token)


def import_songs():
    """Import songs from JSON file to Redis"""
    
    # Get script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    
    # Load songs.json
    songs_file = os.path.join(script_dir, 'songs.json')
    if not os.path.exists(songs_file):
        # Try alternative location
        songs_file = os.path.join(project_dir, 'songs.json')
    
    if not os.path.exists(songs_file):
        print(f"❌ Error: songs.json not found")
        print(f"   Looked in: {script_dir} and {project_dir}")
        sys.exit(1)
    
    print(f"📖 Loading songs from: {songs_file}")
    
    with open(songs_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    songs = data.get('songs', [])
    print(f"🎵 Found {len(songs)} songs to import")
    
    # Connect to Redis
    print("🔌 Connecting to Redis...")
    redis = get_redis_client()
    
    # Test connection
    try:
        redis.ping()
        print("✅ Connected to Redis successfully")
    except Exception as e:
        print(f"❌ Failed to connect to Redis: {e}")
        sys.exit(1)
    
    # Import songs
    success_count = 0
    failed_count = 0
    
    for song_data in songs:
        try:
            # Generate UUID for the song
            song_id = str(uuid.uuid4())
            
            # Create song object matching the TypeScript interface
            song = {
                'id': song_id,
                'name': song_data['name'],
                'singers': song_data.get('singers', []),
                'tags': song_data.get('tags', []),
                'key': 0,  # 原调
                'createdAt': datetime.utcnow().isoformat() + 'Z'
            }
            
            # Save to Redis
            redis.set(f"song:{song_id}", song)
            
            print(f"  ✅ Imported: {song['name']} - {', '.join(song['singers'])}")
            success_count += 1
            
        except Exception as e:
            print(f"  ❌ Failed to import {song_data.get('name', 'Unknown')}: {e}")
            failed_count += 1
    
    print(f"\n{'='*50}")
    print(f"📊 Import Summary:")
    print(f"   Total: {len(songs)}")
    print(f"   Success: {success_count}")
    print(f"   Failed: {failed_count}")
    print(f"{'='*50}")
    
    return success_count, failed_count


if __name__ == '__main__':
    print("🚀 Starting song import...\n")
    import_songs()
