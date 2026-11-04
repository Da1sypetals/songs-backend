import { NextRequest, NextResponse } from 'next/server';

export class StorageError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly data?: unknown
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export function storageJson(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers }
  });
}

// 只把 StorageError 转成响应，其余错误直接向上抛
export async function handleRoute(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof StorageError) {
      return storageJson(
        {
          success: false,
          code: error.code,
          error: error.message,
          ...(error.data === undefined ? {} : { data: error.data })
        },
        error.status
      );
    }
    throw error;
  }
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new StorageError(400, 'INVALID_REQUEST', '请求体不是合法 JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new StorageError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象');
  }
  return value as Record<string, unknown>;
}

export function decodeBase64(value: unknown, field: string): Buffer {
  if (typeof value !== 'string' || value.length === 0) {
    throw new StorageError(400, 'INVALID_REQUEST', `${field} 缺失`);
  }
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new StorageError(400, 'INVALID_REQUEST', `${field} 不是合法的 base64`);
  }
  return Buffer.from(value, 'base64');
}
