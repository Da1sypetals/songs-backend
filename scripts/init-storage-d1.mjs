const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_D1_TOKEN;
const databases = process.env.STORAGE_D1_DATABASES;

if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID 未设置');
if (!token) throw new Error('CLOUDFLARE_D1_TOKEN 未设置');
if (!databases) throw new Error('STORAGE_D1_DATABASES 未设置');

const schema = `
CREATE TABLE IF NOT EXISTS storage_song (
  sha256 TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  singers TEXT NOT NULL,
  format TEXT NOT NULL,
  mime TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  chunk_size INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  payload_bytes INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS storage_chunk (
  sha256 TEXT NOT NULL,
  idx INTEGER NOT NULL,
  chunk_sha256 TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (sha256, idx)
);
CREATE TABLE IF NOT EXISTS storage_usage (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  used_bytes INTEGER NOT NULL
);
INSERT OR IGNORE INTO storage_usage (id, used_bytes) VALUES (1, 0);
`;

const shards = databases.split(',').map((id) => id.trim()).filter(Boolean);
if (shards.length === 0) throw new Error('STORAGE_D1_DATABASES 为空');

for (const databaseId of shards) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql: schema })
    }
  );
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(`${databaseId}: ${JSON.stringify(payload.errors)}`);
  }
  const size = payload.result?.[payload.result.length - 1]?.meta?.size_after;
  console.log(`${databaseId}: ok, size_after=${size}`);
}
