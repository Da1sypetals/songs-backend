import { NextRequest } from 'next/server';
import { MAX_TAKE } from '@/lib/storage/constants';
import { StorageError, handleRoute, storageJson } from '@/lib/storage/errors';
import { findSongAnywhere, readChunks } from '@/lib/storage/songs';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { sha256: string; index: string } }
) {
  return handleRoute(async () => {
    const takeParam = request.nextUrl.searchParams.get('take');
    const take = takeParam === null ? 1 : Number(takeParam);
    if (!Number.isInteger(take) || take < 1) {
      throw new StorageError(400, 'INVALID_REQUEST', 'take 必须是正整数');
    }
    if (take > MAX_TAKE) {
      throw new StorageError(413, 'TOO_MANY_CHUNKS', `单次最多取 ${MAX_TAKE} 个分块`, {
        maxTake: MAX_TAKE
      });
    }

    const found = await findSongAnywhere(params.sha256);
    if (!found || found.song.status !== 'ready') {
      throw new StorageError(404, 'SONG_NOT_FOUND', '曲目不存在');
    }

    const index = Number(params.index);
    if (!Number.isInteger(index) || index < 0 || index >= found.song.chunkCount) {
      throw new StorageError(404, 'CHUNK_NOT_FOUND', '分块不存在', {
        chunkCount: found.song.chunkCount
      });
    }

    const count = Math.min(take, found.song.chunkCount - index);
    const chunks = await readChunks(found.shardId, found.song.sha256, index, count);
    if (chunks.length !== count) {
      throw new Error(`曲目 ${found.song.sha256} 的分块 ${index} 起有缺失`);
    }

    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.data, 'base64')));

    return storageJson(
      {
        success: true,
        data: {
          sha256: found.song.sha256,
          index,
          take: count,
          bytes: buffer.length,
          chunkCount: found.song.chunkCount,
          data: buffer.toString('base64')
        }
      },
      200,
      {
        'X-Song-Sha256': found.song.sha256,
        'X-Chunk-Index': String(index),
        'X-Chunk-Count': String(found.song.chunkCount),
        'X-Total-Size': String(found.song.byteSize),
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    );
  });
}
