import { NextRequest } from 'next/server';
import { handleRoute, storageJson } from '@/lib/storage/errors';
import { StorageError } from '@/lib/storage/errors';
import { assertUploadAuthorized } from '@/lib/storage/auth';
import { cancelSong, findSongAnywhere, toPublicSong } from '@/lib/storage/songs';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { sha256: string } }
) {
  return handleRoute(async () => {
    assertUploadAuthorized(request);

    const found = await findSongAnywhere(params.sha256);
    if (!found) {
      throw new StorageError(404, 'SONG_NOT_FOUND', '曲目不存在');
    }
    if (found.song.status !== 'uploading') {
      throw new StorageError(409, 'UPLOAD_NOT_PENDING', '曲目已经完成上传');
    }

    await cancelSong(found.shardId, found.song);

    return storageJson({ success: true, data: toPublicSong(found.song) });
  });
}
