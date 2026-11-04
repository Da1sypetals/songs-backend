import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const CHUNK_SIZE = 1_400_000;

const [file, name, singers] = process.argv.slice(2);
if (!file || !name || !singers) {
  console.error('用法: node --env-file=.env.local scripts/upload-storage-song.mjs <文件> <歌名> <歌手，用逗号分隔>');
  process.exit(1);
}

const baseUrl = process.env.STORAGE_BASE_URL ?? 'http://localhost:3000';
const password = process.env.SONGLIST_PASSWORD;
if (!password) throw new Error('SONGLIST_PASSWORD 未设置');

async function call(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-storage-password': password
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

const buffer = await readFile(file);
const byteSize = buffer.length;
const sha256 = createHash('sha256').update(buffer).digest('hex');

console.log(`文件 ${file}，${byteSize} 字节，sha256 ${sha256}`);

const created = await call('POST', '/storage/upload', {
  name,
  singers,
  fileName: basename(file),
  byteSize,
  sha256
});

if (created.duplicated) {
  console.log('服务端已有相同 sha256 的曲目，跳过上传');
  process.exit(0);
}

const done = new Set(created.uploadedChunks);
const chunkCount = created.chunkCount;

for (let index = 0; index < chunkCount; index += 1) {
  if (done.has(index)) {
    continue;
  }
  const offset = index * CHUNK_SIZE;
  const slice = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, byteSize));
  await call('PUT', `/storage/upload/${sha256}/${index}`, {
    data: slice.toString('base64'),
    chunkSha256: createHash('sha256').update(slice).digest('hex')
  });
  process.stderr.write(`\r分块 ${index + 1}/${chunkCount}`);
}

process.stderr.write('\n');

const song = await call('POST', `/storage/upload/${sha256}/complete`, {});
console.log(`完成：${song.name} / ${song.singers.join('、')} / ${song.byteSize} 字节`);
