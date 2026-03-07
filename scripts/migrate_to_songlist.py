#!/usr/bin/env python3
"""
迁移脚本：将 Redis 中所有 song:* 独立 key 合并到单个 songlist key 中。

用法：
  python migrate_to_songlist.py            # 执行迁移
  python migrate_to_songlist.py --dry-run  # 仅预览，不实际写入或删除
"""

import json
import os
import sys

from upstash_redis import Redis


def get_redis_client():
    """从 .env.local 读取凭证并创建 Redis 客户端"""
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
        sys.exit(1)

    return Redis(url=url, token=token)


def migrate(dry_run=False):
    """执行迁移：song:* -> songlist"""
    redis = get_redis_client()

    # 测试连接
    redis.ping()
    print("✅ Connected to Redis")

    # 1. 获取所有 song:* key
    keys = redis.keys('song:*')
    print(f"🔍 Found {len(keys)} song:* keys")

    if len(keys) == 0:
        print("⚠️  No song:* keys found. Nothing to migrate.")
        return

    # 2. 逐条读取并组装 songMap
    song_map = {}
    for key in keys:
        song = redis.get(key)
        if song is None:
            print(f"  ⚠️  Key {key} returned None, skipping")
            continue
        if isinstance(song, str):
            song = json.loads(song)
        song_id = song.get('id') or key.replace('song:', '')
        song_map[song_id] = song
        print(f"  📖 Read: {song.get('name', '?')} ({song_id})")

    print(f"\n📦 Assembled songMap with {len(song_map)} songs")

    if dry_run:
        print("\n🏁 [DRY RUN] Would write songMap to key 'songlist' and delete old keys. No changes made.")
        return

    # 3. 写入 songlist key
    redis.set('songlist', json.dumps(song_map, ensure_ascii=False))
    print("✅ Written songMap to 'songlist' key")

    # 4. 验证
    verify = redis.get('songlist')
    if isinstance(verify, str):
        verify = json.loads(verify)
    if len(verify) != len(song_map):
        print(f"❌ Verification failed! Expected {len(song_map)} songs, got {len(verify)}")
        sys.exit(1)
    print(f"✅ Verification passed: {len(verify)} songs in songlist")

    # 5. 删除旧 key
    for key in keys:
        redis.delete(key)
    print(f"🗑️  Deleted {len(keys)} old song:* keys")

    print(f"\n{'='*50}")
    print(f"🎉 Migration complete!")
    print(f"   Songs migrated: {len(song_map)}")
    print(f"   Old keys deleted: {len(keys)}")
    print(f"{'='*50}")


if __name__ == '__main__':
    dry_run = '--dry-run' in sys.argv
    if dry_run:
        print("🚀 Starting migration (DRY RUN)...\n")
    else:
        print("🚀 Starting migration...\n")
    migrate(dry_run=dry_run)
