import { d1Query } from '@/lib/d1';
import { SHARD_MAX_BYTES } from './constants';
import { StorageError } from './errors';

export function getShardIds(): string[] {
  const raw = process.env.STORAGE_D1_DATABASES;
  if (!raw) {
    throw new Error('环境变量 STORAGE_D1_DATABASES 未设置');
  }
  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    throw new Error('环境变量 STORAGE_D1_DATABASES 为空');
  }
  return ids;
}

export interface ShardUsage {
  shardId: string;
  usedBytes: number;
}

export async function listShardUsage(): Promise<ShardUsage[]> {
  return Promise.all(
    getShardIds().map(async (shardId) => {
      const { results } = await d1Query(shardId, 'SELECT used_bytes FROM storage_usage WHERE id = 1');
      return { shardId, usedBytes: Number(results[0]?.used_bytes ?? 0) };
    })
  );
}

export async function pickShard(payloadBytes: number): Promise<string> {
  const usage = await listShardUsage();
  const candidates = usage
    .filter((item) => item.usedBytes + payloadBytes <= SHARD_MAX_BYTES)
    .sort((a, b) => a.usedBytes - b.usedBytes);

  if (candidates.length === 0) {
    throw new StorageError(507, 'STORAGE_FULL', '存储空间已满');
  }
  return candidates[0].shardId;
}
