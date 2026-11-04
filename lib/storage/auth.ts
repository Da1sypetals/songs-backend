import { NextRequest } from 'next/server';
import { StorageError } from './errors';

export function assertUploadAuthorized(request: NextRequest): void {
  const password = process.env.SONGLIST_PASSWORD;
  if (!password) {
    throw new Error('环境变量 SONGLIST_PASSWORD 未设置');
  }
  if (request.headers.get('x-storage-password') !== password) {
    throw new StorageError(401, 'UNAUTHORIZED', '密码错误');
  }
}
