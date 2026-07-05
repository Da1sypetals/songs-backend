import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const redis = Redis.fromEnv();
const GIST_FILENAME = 'redis-backup.json';

async function getAllRedisData() {
  const keys = await redis.keys('*');
  const entries = await Promise.all(
    keys.map(async (key) => [key, await redis.get(key)] as const)
  );

  return {
    keys,
    data: Object.fromEntries(entries)
  };
}

export async function GET() {
  try {
    const gistId = process.env.GIST_ID;
    const gistToken = process.env.GIST_TOKEN;

    if (!gistId || !gistToken) {
      return NextResponse.json({
        success: false,
        error: 'Missing GIST_ID or GIST_TOKEN'
      }, { status: 500 });
    }

    const backedUpAt = new Date().toISOString();
    const { keys, data } = await getAllRedisData();

    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${gistToken}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: {
            content: `${JSON.stringify({
              backedUpAt,
              keyCount: keys.length,
              keys,
              data
            }, null, 2)}\n`
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();

      return NextResponse.json({
        success: false,
        error: `Gist update failed: ${response.status} ${response.statusText}`,
        details: errorText
      }, { status: 500 });
    }

    const gist = await response.json();

    return NextResponse.json({
      success: true,
      backedUpAt,
      keyCount: keys.length,
      gistUrl: gist.html_url,
      filename: GIST_FILENAME
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
