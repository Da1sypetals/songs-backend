import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { Song, SongMap } from '@/types/song';

const redis = Redis.fromEnv();
const SONGLIST_KEY = 'songlist';

async function getSongMap(): Promise<SongMap> {
  return (await redis.get<SongMap>(SONGLIST_KEY)) ?? {};
}

async function setSongMap(songMap: SongMap): Promise<void> {
  await redis.set(SONGLIST_KEY, songMap);
}

// 获取单首歌曲
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const songMap = await getSongMap();
    const song = songMap[params.id];

    if (!song) {
      return NextResponse.json({
        success: false,
        error: '歌曲不存在'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: song
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 更新歌曲
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, singers, tags, key, notes } = body;

    const songMap = await getSongMap();
    const existingSong = songMap[params.id];

    if (!existingSong) {
      return NextResponse.json({
        success: false,
        error: '歌曲不存在'
      }, { status: 404 });
    }

    // 验证必填字段
    if (!name || !name.trim()) {
      return NextResponse.json({
        success: false,
        error: '歌曲名称是必填项'
      }, { status: 400 });
    }

    if (!singers || !Array.isArray(singers) || singers.length === 0) {
      return NextResponse.json({
        success: false,
        error: '至少需要一个参考歌手'
      }, { status: 400 });
    }

    // 更新歌曲（保留创建时间）
    const updatedSong: Song = {
      id: params.id,
      name: name.trim(),
      singers: singers.filter((s: string) => s.trim()).map((s: string) => s.trim()),
      tags: tags ? tags.filter((t: string) => t.trim()).map((t: string) => t.trim()) : [],
      key: typeof key === 'number' ? key : 0,
      notes: notes?.trim() || undefined,
      featured: body.featured === true,
      createdAt: existingSong.createdAt
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

// 删除歌曲
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const songMap = await getSongMap();

    if (!songMap[params.id]) {
      return NextResponse.json({
        success: false,
        error: '歌曲不存在'
      }, { status: 404 });
    }

    delete songMap[params.id];
    await setSongMap(songMap);

    return NextResponse.json({
      success: true,
      message: '歌曲删除成功'
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
