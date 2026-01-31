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
