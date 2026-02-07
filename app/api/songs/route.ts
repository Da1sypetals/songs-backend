import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { Song, CreateSongRequest } from '@/types/song';

const redis = Redis.fromEnv();

// 获取所有歌曲 - 使用 Pipeline 优化
export async function GET() {
  try {
    const keys = await redis.keys('song:*');

    if (keys.length === 0) {
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    // 使用 pipeline 批量获取所有歌曲
    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.get(key);
    }

    const results = await pipeline.exec();
    const songs: Song[] = [];

    for (const result of results) {
      if (result) {
        songs.push(result as Song);
      }
    }

    // 按创建时间排序
    songs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      success: true,
      data: songs
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 添加新歌
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, singers, tags, key, notes } = body;

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

    const id = uuidv4();
    const song: Song = {
      id,
      name: name.trim(),
      singers: singers.filter((s: string) => s.trim()).map((s: string) => s.trim()),
      tags: tags ? tags.filter((t: string) => t.trim()).map((t: string) => t.trim()) : [],
      key: typeof key === 'number' ? key : 0,
      notes: notes?.trim() || undefined,
      featured: body.featured === true,
      createdAt: new Date().toISOString()
    };

    await redis.set(`song:${id}`, song);

    return NextResponse.json({
      success: true,
      data: song
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
