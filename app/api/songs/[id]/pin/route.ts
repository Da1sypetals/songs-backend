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

// 切换歌曲 pin 状态
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await Promise.resolve(params);
    const body = await request.json();

    if (typeof body.pinned !== 'boolean') {
      return NextResponse.json({
        success: false,
        error: 'pinned 参数必须为布尔值'
      }, { status: 400 });
    }

    const songMap = await getSongMap();
    const existingSong = songMap[id];

    if (!existingSong) {
      return NextResponse.json({
        success: false,
        error: '歌曲不存在'
      }, { status: 404 });
    }

    const updatedSong = {
      ...existingSong,
      pinned: body.pinned
    };

    songMap[id] = updatedSong;
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
