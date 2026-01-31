import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { Song } from '@/types/song';

const redis = Redis.fromEnv();

// 获取单首歌曲
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const song = await redis.get<Song>(`song:${params.id}`);

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
    const existingSong = await redis.get<Song>(`song:${params.id}`);

    if (!existingSong) {
      return NextResponse.json({
        success: false,
        error: '歌曲不存在'
      }, { status: 404 });
    }

    const body = await request.json();
    const { name, singers, tags, key } = body;

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({
        success: false,
        error: '歌曲名称不能为空'
      }, { status: 400 });
    }

    if (singers !== undefined && (!Array.isArray(singers) || singers.length === 0)) {
      return NextResponse.json({
        success: false,
        error: '至少需要一个参考歌手'
      }, { status: 400 });
    }

    const updatedSong: Song = {
      ...existingSong,
      ...(name !== undefined && { name: name.trim() }),
      ...(singers !== undefined && { singers: singers.filter((s: string) => s.trim()).map((s: string) => s.trim()) }),
      ...(tags !== undefined && { tags: tags.filter((t: string) => t.trim()).map((t: string) => t.trim()) }),
      ...(key !== undefined && { key: typeof key === 'number' ? key : 0 }),
    };

    await redis.set(`song:${params.id}`, updatedSong);

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
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await redis.del(`song:${params.id}`);

    if (result === 0) {
      return NextResponse.json({
        success: false,
        error: '歌曲不存在'
      }, { status: 404 });
    }

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
