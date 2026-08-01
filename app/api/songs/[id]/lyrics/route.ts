import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { SongMap } from '@/types/song';

const redis = Redis.fromEnv();
const SONGLIST_KEY = 'songlist';

async function getSongMap(): Promise<SongMap> {
  return (await redis.get<SongMap>(SONGLIST_KEY)) ?? {};
}

async function setSongMap(songMap: SongMap): Promise<void> {
  await redis.set(SONGLIST_KEY, songMap);
}

// 保存歌词
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const lyrics = typeof body.lyrics === 'string' ? body.lyrics.trim() : '';

    const songMap = await getSongMap();
    const existingSong = songMap[params.id];

    if (!existingSong) {
      return NextResponse.json({
        success: false,
        error: '歌曲不存在'
      }, { status: 404 });
    }

    const updatedSong = {
      ...existingSong,
      lyrics: lyrics || undefined
    };

    songMap[params.id] = updatedSong;
    await setSongMap(songMap);

    return NextResponse.json({
      success: true,
      data: updatedSong
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
