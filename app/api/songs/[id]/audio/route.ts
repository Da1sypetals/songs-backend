import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { SongAudioRecord, SongMap } from '@/types/song';
import {
  deleteAudioObject,
  getAudioObject,
  getAudioObjectKey,
  getBackblazeAudioConfig,
  putAudioObject
} from '@/lib/backblaze-audio';

const redis = Redis.fromEnv();
const SONGLIST_KEY = 'songlist';
const MAX_DURATION_SECONDS = 150;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

async function getSongMap(): Promise<SongMap> {
  return (await redis.get<SongMap>(SONGLIST_KEY)) ?? {};
}

async function setSongMap(songMap: SongMap): Promise<void> {
  await redis.set(SONGLIST_KEY, songMap);
}

function isMp3Buffer(buffer: Buffer): boolean {
  if (buffer.length < 3) return false;
  const hasId3Header = buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33;
  const hasFrameSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  return hasId3Header || hasFrameSync;
}

function validateAudioBody(body: Record<string, unknown>): SongAudioRecord {
  if (typeof body.base64 !== 'string' || body.base64.length === 0) {
    throw new Error('缺少音频内容');
  }

  if (body.contentType !== 'audio/mpeg') {
    throw new Error('只允许上传 MP3 文件');
  }

  const durationSeconds = Number(body.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error('音频时长必须小于 150 秒');
  }

  const fileName = typeof body.fileName === 'string' && body.fileName.trim()
    ? body.fileName.trim()
    : 'song.mp3';

  if (!fileName.toLowerCase().endsWith('.mp3')) {
    throw new Error('只允许上传 MP3 文件');
  }

  const buffer = Buffer.from(body.base64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_AUDIO_BYTES || !isMp3Buffer(buffer)) {
    throw new Error('音频文件无效');
  }

  return {
    base64: body.base64,
    fileName,
    contentType: 'audio/mpeg',
    byteSize: buffer.length,
    durationSeconds,
    updatedAt: new Date().toISOString()
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const songMap = await getSongMap();
  const song = songMap[params.id];

  if (!song) {
    return NextResponse.json({
      success: false,
      error: '歌曲不存在'
    }, { status: 404 });
  }

  const objectKey = song.audioMeta?.objectKey || getAudioObjectKey(params.id);
  if (!song.hasAudio) {
    return NextResponse.json({
      success: false,
      error: '音频不存在'
    }, { status: 404 });
  }

  const audioBuffer = await getAudioObject(await getBackblazeAudioConfig(redis), objectKey);
  const audioMeta = song.audioMeta;

  if (!audioMeta) {
    throw new Error('音频元数据不存在');
  }

  return NextResponse.json({
    success: true,
    data: {
      ...audioMeta,
      base64: audioBuffer.toString('base64')
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const songMap = await getSongMap();
  const song = songMap[params.id];

  if (!song) {
    return NextResponse.json({
      success: false,
      error: '歌曲不存在'
    }, { status: 404 });
  }

  const body = await request.json();
  const audio = validateAudioBody(body);
  const objectKey = getAudioObjectKey(params.id);
  await putAudioObject(await getBackblazeAudioConfig(redis), objectKey, Buffer.from(audio.base64, 'base64'));

  songMap[params.id] = {
    ...song,
    hasAudio: true,
    audioMeta: {
      fileName: audio.fileName,
      contentType: audio.contentType,
      byteSize: audio.byteSize,
      durationSeconds: audio.durationSeconds,
      updatedAt: audio.updatedAt,
      objectKey
    }
  };
  await setSongMap(songMap);

  return NextResponse.json({
    success: true,
    data: songMap[params.id]
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const songMap = await getSongMap();
  const song = songMap[params.id];

  if (!song) {
    return NextResponse.json({
      success: false,
      error: '歌曲不存在'
    }, { status: 404 });
  }

  if (song.hasAudio) {
    await deleteAudioObject(await getBackblazeAudioConfig(redis), song.audioMeta?.objectKey || getAudioObjectKey(params.id));
  }
  const { hasAudio, audioMeta, ...songWithoutAudio } = song;
  songMap[params.id] = songWithoutAudio;
  await setSongMap(songMap);

  return NextResponse.json({
    success: true,
    data: songMap[params.id]
  });
}
