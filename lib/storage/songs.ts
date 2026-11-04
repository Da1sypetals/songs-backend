import { d1Batch, d1Query, D1Statement } from '@/lib/d1';
import { base64Length, chunkBytesAt } from './constants';
import { StorageError } from './errors';
import { getShardIds } from './shards';

export type SongStatus = 'uploading' | 'ready';

export interface StoredSong {
  sha256: string;
  name: string;
  singers: string[];
  format: string;
  mime: string;
  byteSize: number;
  chunkSize: number;
  chunkCount: number;
  payloadBytes: number;
  status: SongStatus;
  createdAt: string;
}

export interface PublicSong {
  sha256: string;
  name: string;
  singers: string[];
  format: string;
  mime: string;
  byteSize: number;
  chunkSize: number;
  chunkCount: number;
  createdAt: string;
}

export interface ChunkInput {
  index: number;
  data: string;
  chunkSha256: string;
}

const SONG_COLUMNS =
  'sha256, name, singers, format, mime, byte_size, chunk_size, chunk_count, payload_bytes, status, created_at';

const INSERT_SONG = `INSERT INTO storage_song (${SONG_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const ADD_USAGE = 'UPDATE storage_usage SET used_bytes = used_bytes + ? WHERE id = 1';
const INSERT_CHUNK =
  'INSERT OR REPLACE INTO storage_chunk (sha256, idx, chunk_sha256, data) VALUES (?, ?, ?, ?)';

function toStoredSong(row: Record<string, unknown>): StoredSong {
  return {
    sha256: String(row.sha256),
    name: String(row.name),
    singers: JSON.parse(String(row.singers)) as string[],
    format: String(row.format),
    mime: String(row.mime),
    byteSize: Number(row.byte_size),
    chunkSize: Number(row.chunk_size),
    chunkCount: Number(row.chunk_count),
    payloadBytes: Number(row.payload_bytes),
    status: String(row.status) as SongStatus,
    createdAt: String(row.created_at)
  };
}

export function toPublicSong(song: StoredSong): PublicSong {
  return {
    sha256: song.sha256,
    name: song.name,
    singers: song.singers,
    format: song.format,
    mime: song.mime,
    byteSize: song.byteSize,
    chunkSize: song.chunkSize,
    chunkCount: song.chunkCount,
    createdAt: song.createdAt
  };
}

function songParams(song: StoredSong): unknown[] {
  return [
    song.sha256,
    song.name,
    JSON.stringify(song.singers),
    song.format,
    song.mime,
    song.byteSize,
    song.chunkSize,
    song.chunkCount,
    song.payloadBytes,
    song.status,
    song.createdAt
  ];
}

export async function createSong(shardId: string, song: StoredSong): Promise<void> {
  await d1Batch(shardId, [
    { sql: INSERT_SONG, params: songParams(song) },
    { sql: ADD_USAGE, params: [song.payloadBytes] }
  ]);
}

export async function createSongWithChunks(
  shardId: string,
  song: StoredSong,
  chunks: ChunkInput[]
): Promise<void> {
  const statements: D1Statement[] = [
    { sql: INSERT_SONG, params: songParams(song) },
    { sql: ADD_USAGE, params: [song.payloadBytes] },
    ...chunks.map((chunk) => ({
      sql: INSERT_CHUNK,
      params: [song.sha256, chunk.index, chunk.chunkSha256, chunk.data]
    })),
    { sql: "UPDATE storage_song SET status = 'ready' WHERE sha256 = ?", params: [song.sha256] }
  ];
  await d1Batch(shardId, statements);
}

export async function findSongAnywhere(
  sha256: string
): Promise<{ shardId: string; song: StoredSong } | null> {
  const found = await Promise.all(
    getShardIds().map(async (shardId) => {
      const { results } = await d1Query(
        shardId,
        `SELECT ${SONG_COLUMNS} FROM storage_song WHERE sha256 = ?`,
        [sha256]
      );
      return results.length > 0 ? { shardId, song: toStoredSong(results[0]) } : null;
    })
  );
  return found.find((entry) => entry !== null) ?? null;
}

export async function getUploadedChunks(shardId: string, sha256: string): Promise<number[]> {
  const { results } = await d1Query(
    shardId,
    'SELECT idx FROM storage_chunk WHERE sha256 = ? ORDER BY idx',
    [sha256]
  );
  return results.map((row) => Number(row.idx));
}

export async function putChunk(
  shardId: string,
  sha256: string,
  chunk: ChunkInput
): Promise<void> {
  await d1Query(shardId, INSERT_CHUNK, [
    sha256,
    chunk.index,
    chunk.chunkSha256,
    chunk.data
  ]);
}

export async function completeSong(shardId: string, song: StoredSong): Promise<void> {
  const { results } = await d1Query(
    shardId,
    'SELECT idx, LENGTH(data) AS payload FROM storage_chunk WHERE sha256 = ? ORDER BY idx',
    [song.sha256]
  );

  const present = new Set(results.map((row) => Number(row.idx)));
  if (results.length !== song.chunkCount) {
    const missing = Array.from({ length: song.chunkCount }, (_, index) => index).filter(
      (index) => !present.has(index)
    );
    throw new StorageError(409, 'INCOMPLETE_UPLOAD', `缺少 ${missing.length} 个分块`, { missing });
  }

  for (let index = 0; index < results.length; index += 1) {
    const row = results[index];
    if (Number(row.idx) !== index) {
      throw new StorageError(409, 'INCOMPLETE_UPLOAD', `分块序号不连续：第 ${index} 个位置是 ${row.idx}`);
    }
    const expected = base64Length(chunkBytesAt(song.byteSize, index));
    if (Number(row.payload) !== expected) {
      throw new StorageError(
        409,
        'INCOMPLETE_UPLOAD',
        `分块 ${index} 长度为 ${row.payload}，应为 ${expected}`
      );
    }
  }

  await d1Query(shardId, "UPDATE storage_song SET status = 'ready' WHERE sha256 = ?", [
    song.sha256
  ]);
}

export async function cancelSong(shardId: string, song: StoredSong): Promise<void> {
  await d1Batch(shardId, [
    { sql: 'DELETE FROM storage_chunk WHERE sha256 = ?', params: [song.sha256] },
    { sql: 'DELETE FROM storage_song WHERE sha256 = ?', params: [song.sha256] },
    { sql: 'UPDATE storage_usage SET used_bytes = used_bytes - ? WHERE id = 1', params: [song.payloadBytes] }
  ]);
}

export async function readChunks(
  shardId: string,
  sha256: string,
  start: number,
  take: number
): Promise<{ index: number; data: string }[]> {
  const { results } = await d1Query(
    shardId,
    'SELECT idx, data FROM storage_chunk WHERE sha256 = ? AND idx >= ? AND idx < ? ORDER BY idx',
    [sha256, start, start + take]
  );
  return results.map((row) => ({ index: Number(row.idx), data: String(row.data) }));
}

export async function listReadySongs(): Promise<StoredSong[]> {
  const perShard = await Promise.all(
    getShardIds().map((shardId) =>
      d1Query(
        shardId,
        `SELECT ${SONG_COLUMNS} FROM storage_song WHERE status = 'ready' ORDER BY created_at DESC`
      )
    )
  );
  const songs = perShard.flatMap((result) => result.results.map(toStoredSong));
  songs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return songs;
}

export async function getUsedBytes(): Promise<number> {
  const perShard = await Promise.all(
    getShardIds().map((shardId) =>
      d1Query(shardId, 'SELECT used_bytes FROM storage_usage WHERE id = 1')
    )
  );
  return perShard.reduce((sum, result) => sum + Number(result.results[0]?.used_bytes ?? 0), 0);
}
