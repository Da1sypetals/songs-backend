import { STORAGE_QUOTA_BYTES } from '@/lib/storage/constants';
import { handleRoute, storageJson } from '@/lib/storage/errors';
import { getUsedBytes, listReadySongs, toPublicSong } from '@/lib/storage/songs';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handleRoute(async () => {
    const [songs, usedBytes] = await Promise.all([listReadySongs(), getUsedBytes()]);

    return storageJson({
      success: true,
      data: {
        quota: { limitBytes: STORAGE_QUOTA_BYTES, usedBytes },
        songs: songs.map(toPublicSong)
      }
    });
  });
}
