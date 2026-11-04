import { NextRequest } from 'next/server';
import { MAX_INLINE_BYTES } from '@/lib/storage/constants';
import { StorageError, handleRoute, storageJson } from '@/lib/storage/errors';
import { findSongAnywhere, readChunks, toPublicSong } from '@/lib/storage/songs';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { sha256: string } }
) {
  return handleRoute(async () => {
    const found = await findSongAnywhere(params.sha256);
    if (!found || found.song.status !== 'ready') {
      throw new StorageError(404, 'SONG_NOT_FOUND', '曲目不存在');
    }

    if (found.song.byteSize > MAX_INLINE_BYTES) {
      throw new StorageError(
        413,
        'SONG_TOO_LARGE',
        `歌曲 ${found.song.byteSize} 字节，超过单次下载上限 ${MAX_INLINE_BYTES} 字节`,
        { ...toPublicSong(found.song), maxInlineBytes: MAX_INLINE_BYTES }
      );
    }

    const chunks = await readChunks(found.shardId, found.song.sha256, 0, found.song.chunkCount);
    if (chunks.length !== found.song.chunkCount) {
      throw new Error(`曲目 ${found.song.sha256} 的分块不完整`);
    }

    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.data, 'base64')));

    return storageJson(
      {
        success: true,
        data: { ...toPublicSong(found.song), data: buffer.toString('base64') }
      },
      200,
      { ETag: `"${found.song.sha256}"` }
    );
  });
}
