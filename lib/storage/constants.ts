export const CHUNK_SIZE = 1_400_000;
export const MAX_INLINE_BYTES = 2_800_000;
export const MAX_TAKE = 2;
export const SHARD_MAX_BYTES = 470_000_000;
export const STORAGE_QUOTA_BYTES = 940_000_000;

export interface AudioFormat {
  mime: string;
  maxBytes: number;
}

const OTHER_AUDIO_MAX_BYTES = 20_971_520;

export const AUDIO_FORMATS: Record<string, AudioFormat> = {
  mp3: { mime: 'audio/mpeg', maxBytes: 104_857_600 },
  flac: { mime: 'audio/flac', maxBytes: OTHER_AUDIO_MAX_BYTES },
  m4a: { mime: 'audio/mp4', maxBytes: OTHER_AUDIO_MAX_BYTES },
  aac: { mime: 'audio/aac', maxBytes: OTHER_AUDIO_MAX_BYTES },
  wav: { mime: 'audio/wav', maxBytes: OTHER_AUDIO_MAX_BYTES },
  ogg: { mime: 'audio/ogg', maxBytes: OTHER_AUDIO_MAX_BYTES },
  opus: { mime: 'audio/opus', maxBytes: OTHER_AUDIO_MAX_BYTES },
  aiff: { mime: 'audio/aiff', maxBytes: OTHER_AUDIO_MAX_BYTES },
  wma: { mime: 'audio/x-ms-wma', maxBytes: OTHER_AUDIO_MAX_BYTES }
};

export function chunkCountFor(byteSize: number): number {
  return Math.ceil(byteSize / CHUNK_SIZE);
}

// 第 index 个分块解码后的字节数
export function chunkBytesAt(byteSize: number, index: number): number {
  return Math.min(CHUNK_SIZE, byteSize - index * CHUNK_SIZE);
}

export function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

// 整首歌在库里占用的 base64 字节数，配额按这个值记账
export function payloadBytesFor(byteSize: number): number {
  const count = chunkCountFor(byteSize);
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += base64Length(chunkBytesAt(byteSize, index));
  }
  return total;
}
