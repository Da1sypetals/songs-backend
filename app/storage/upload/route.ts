import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import {
  AUDIO_FORMATS,
  CHUNK_SIZE,
  MAX_INLINE_BYTES,
  chunkBytesAt,
  chunkCountFor,
  payloadBytesFor
} from '@/lib/storage/constants';
import { StorageError, decodeBase64, handleRoute, readJsonBody, storageJson } from '@/lib/storage/errors';
import { assertUploadAuthorized } from '@/lib/storage/auth';
import { isMp3Header } from '@/lib/storage/audio';
import {
  ChunkInput,
  StoredSong,
  createSong,
  createSongWithChunks,
  findSongAnywhere,
  getUploadedChunks,
  toPublicSong
} from '@/lib/storage/songs';
import { pickShard } from '@/lib/storage/shards';

export const dynamic = 'force-dynamic';

interface FormatSpec {
  format: string;
  mime: string;
  maxBytes: number;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new StorageError(400, 'INVALID_REQUEST', '歌曲名称是必填项');
  }
  return value.trim();
}

function parseSingers(value: unknown): string[] {
  if (typeof value !== 'string') {
    throw new StorageError(400, 'INVALID_REQUEST', 'singers 必须是字符串');
  }
  const singers = value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  if (singers.length === 0) {
    throw new StorageError(400, 'INVALID_REQUEST', '至少需要一个歌手');
  }
  return singers;
}

function parseFormat(value: unknown): FormatSpec {
  if (typeof value !== 'string' || !value.trim()) {
    throw new StorageError(400, 'INVALID_REQUEST', 'fileName 是必填项');
  }
  const extension = value.trim().toLowerCase().split('.').pop() ?? '';
  const spec = AUDIO_FORMATS[extension];
  if (!spec) {
    throw new StorageError(415, 'UNSUPPORTED_FORMAT', `不支持的音频格式 .${extension}`);
  }
  return { format: extension, mime: spec.mime, maxBytes: spec.maxBytes };
}

function parseByteSize(value: unknown, spec: FormatSpec): number {
  const byteSize = Number(value);
  if (!Number.isInteger(byteSize) || byteSize <= 0) {
    throw new StorageError(400, 'INVALID_REQUEST', 'byteSize 必须是正整数');
  }
  if (byteSize > spec.maxBytes) {
    throw new StorageError(
      413,
      'FILE_TOO_LARGE',
      `${spec.format} 上限 ${spec.maxBytes} 字节，实际 ${byteSize} 字节`,
      { maxBytes: spec.maxBytes }
    );
  }
  return byteSize;
}

function parseSha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new StorageError(400, 'INVALID_REQUEST', 'sha256 必须是 64 位小写十六进制');
  }
  return value;
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    assertUploadAuthorized(request);

    const body = await readJsonBody(request);
    const name = parseName(body.name);
    const singers = parseSingers(body.singers);
    const spec = parseFormat(body.fileName);
    const byteSize = parseByteSize(body.byteSize, spec);
    const sha256 = parseSha256(body.sha256);

    const existing = await findSongAnywhere(sha256);
    if (existing) {
      const uploadedChunks =
        existing.song.status === 'ready' ? [] : await getUploadedChunks(existing.shardId, sha256);
      return storageJson({
        success: true,
        data: {
          ...toPublicSong(existing.song),
          duplicated: existing.song.status === 'ready',
          uploadedChunks
        }
      });
    }

    const chunkCount = chunkCountFor(byteSize);
    const payloadBytes = payloadBytesFor(byteSize);
    const base: StoredSong = {
      sha256,
      name,
      singers,
      format: spec.format,
      mime: spec.mime,
      byteSize,
      chunkSize: CHUNK_SIZE,
      chunkCount,
      payloadBytes,
      status: 'uploading',
      createdAt: new Date().toISOString()
    };

    if (body.data !== undefined) {
      if (byteSize > MAX_INLINE_BYTES) {
        throw new StorageError(
          413,
          'SONG_TOO_LARGE',
          `一次性上传上限 ${MAX_INLINE_BYTES} 字节，请改用分块上传`,
          { maxInlineBytes: MAX_INLINE_BYTES, chunkCount }
        );
      }

      const buffer = decodeBase64(body.data, 'data');
      if (buffer.length !== byteSize) {
        throw new StorageError(
          400,
          'INVALID_REQUEST',
          `data 解码后是 ${buffer.length} 字节，与 byteSize 不符`
        );
      }
      if (spec.format === 'mp3' && !isMp3Header(buffer)) {
        throw new StorageError(415, 'UNSUPPORTED_FORMAT', '文件不是有效的 mp3');
      }

      const chunks: ChunkInput[] = [];
      for (let index = 0; index < chunkCount; index += 1) {
        const offset = index * CHUNK_SIZE;
        const slice = buffer.subarray(offset, offset + chunkBytesAt(byteSize, index));
        chunks.push({
          index,
          data: slice.toString('base64'),
          chunkSha256: createHash('sha256').update(slice).digest('hex')
        });
      }

      const shardId = await pickShard(payloadBytes);
      await createSongWithChunks(shardId, base, chunks);
      return storageJson(
        {
          success: true,
          data: {
            ...toPublicSong({ ...base, status: 'ready' }),
            duplicated: false,
            uploadedChunks: []
          }
        },
        201
      );
    }

    const shardId = await pickShard(payloadBytes);
    await createSong(shardId, base);
    return storageJson(
      {
        success: true,
        data: {
          ...toPublicSong(base),
          duplicated: false,
          uploadedChunks: []
        }
      },
      201
    );
  });
}
