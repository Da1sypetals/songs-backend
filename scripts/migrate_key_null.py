#!/usr/bin/env python3
"""
迁移脚本：将 Redis 中所有 key=0 的歌曲改为 key=null（未定调）。

用法：
  python migrate_key_null.py --dry-run  # 预览模式，不实际修改数据
  python migrate_key_null.py            # 执行实际迁移
"""

import json
import os
import sys
import argparse

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
    """执行迁移：key=0 -> key=null"""
    redis = get_redis_client()

    # 测试连接
    redis.ping()
    print("✅ Connected to Redis")

    # 1. 获取 songlist
    songlist = redis.get('songlist')
    if songlist is None:
        print("⚠️  No songlist found. Nothing to migrate.")
        return

    if isinstance(songlist, str):
        songlist = json.loads(songlist)

    print(f"🔍 Found {len(songlist)} songs in songlist")

    # 2. 找出所有 key=0 的歌曲
    songs_to_migrate = []
    for song_id, song in songlist.items():
        if song.get('key') == 0:
            songs_to_migrate.append({
                'id': song_id,
                'name': song.get('name', '?'),
                'singers': song.get('singers', [])
            })

    print(f"\n📋 Songs with key=0 (to be migrated to null):")
    print("-" * 60)

    for i, song in enumerate(songs_to_migrate, 1):
        singers_str = ', '.join(song['singers']) if song['singers'] else 'Unknown'
        print(f"  {i}. {song['name']} - {singers_str}")

    print("-" * 60)
    print(f"📊 Total: {len(songs_to_migrate)} songs to migrate")

    if len(songs_to_migrate) == 0:
        print("\n✅ No songs with key=0 found. Nothing to migrate.")
        return

    if dry_run:
        print("\n🏁 [DRY RUN] Would migrate these songs from key=0 to key=null.")
        print("   Run without --dry-run to apply changes.")
        return

    # 3. 执行迁移
    print(f"\n⏳ Migrating {len(songs_to_migrate)} songs...")

    migrated_count = 0
    for song in songs_to_migrate:
        songlist[song['id']]['key'] = None
        migrated_count += 1

    # 4. 写回 Redis
    redis.set('songlist', json.dumps(songlist, ensure_ascii=False))
    print(f"✅ Written updated songlist to Redis")

    # 5. 验证
    verify = redis.get('songlist')
    if isinstance(verify, str):
        verify = json.loads(verify)

    null_count = sum(1 for s in verify.values() if s.get('key') is None)
    print(f"✅ Verification: {null_count} songs now have key=null")

    print(f"\n{'='*60}")
    print(f"🎉 Migration complete!")
    print(f"   Songs migrated: {migrated_count}")
    print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description='Migrate key=0 songs to key=null')
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without modifying data')
    args = parser.parse_args()

    migrate(dry_run=args.dry_run)


if __name__ == '__main__':
    main()
