import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { Song, SongMap } from '@/types/song';

const redis = Redis.fromEnv();
const SONGLIST_KEY = 'songlist';

async function getSongMap(): Promise<SongMap> {
  return (await redis.get<SongMap>(SONGLIST_KEY)) ?? {};
}

async function setSongMap(songMap: SongMap): Promise<void> {
  await redis.set(SONGLIST_KEY, songMap);
}

// 获取所有歌曲
export async function GET() {
  try {
    const songMap = await getSongMap();
    const songs: Song[] = Object.values(songMap);

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
      key: key === null ? null : (typeof key === 'number' ? key : 0),
      notes: notes?.trim() || undefined,
      featured: body.featured === true,
      createdAt: new Date().toISOString()
    };

    const songMap = await getSongMap();
    songMap[id] = song;
    await setSongMap(songMap);

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
