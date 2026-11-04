import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { chunkBytesAt } from '@/lib/storage/constants';
import { StorageError, decodeBase64, handleRoute, readJsonBody, storageJson } from '@/lib/storage/errors';
import { assertUploadAuthorized } from '@/lib/storage/auth';
import { findSongAnywhere, putChunk } from '@/lib/storage/songs';
import { isMp3Header } from '@/lib/storage/audio';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: { sha256: string; index: string } }
) {
  return handleRoute(async () => {
    assertUploadAuthorized(request);

    const found = await findSongAnywhere(params.sha256);
    if (!found) {
      throw new StorageError(404, 'SONG_NOT_FOUND', '曲目不存在');
    }
    if (found.song.status !== 'uploading') {
      throw new StorageError(409, 'UPLOAD_NOT_PENDING', '曲目已经完成上传');
    }

    const index = Number(params.index);
    if (!Number.isInteger(index) || index < 0 || index >= found.song.chunkCount) {
      throw new StorageError(400, 'INVALID_REQUEST', '分块序号超出范围', {
        chunkCount: found.song.chunkCount
      });
    }

    const body = await readJsonBody(request);
    const expectedBytes = chunkBytesAt(found.song.byteSize, index);
    const buffer = decodeBase64(body.data, 'data');
    if (buffer.length !== expectedBytes) {
      throw new StorageError(
        400,
        'INVALID_REQUEST',
        `分块解码后是 ${buffer.length} 字节，应为 ${expectedBytes} 字节`
      );
    }
    if (index === 0 && found.song.format === 'mp3' && !isMp3Header(buffer)) {
      throw new StorageError(415, 'UNSUPPORTED_FORMAT', '文件不是有效的 mp3');
    }

    const digest = createHash('sha256').update(buffer).digest('hex');
    if (body.chunkSha256 !== digest) {
      throw new StorageError(400, 'CHUNK_HASH_MISMATCH', '分块 sha256 不符', { expected: digest });
    }

    await putChunk(found.shardId, found.song.sha256, {
      index,
      data: String(body.data),
      chunkSha256: digest
    });

    return storageJson({
      success: true,
      data: { index, chunkSha256: digest, chunkCount: found.song.chunkCount }
    });
  });
}
