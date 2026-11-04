const API_BASE = 'https://api.cloudflare.com/client/v4';

export interface D1Statement {
  sql: string;
  params?: unknown[];
}

export interface D1Result {
  results: Record<string, unknown>[];
  changes: number;
}

interface RawQueryResult {
  results?: Record<string, unknown>[];
  meta?: { changes?: number };
  success?: boolean;
}

interface RawResponse {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: RawQueryResult[];
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`环境变量 ${name} 未设置`);
  }
  return value;
}

async function callD1(databaseId: string, body: unknown): Promise<RawQueryResult[]> {
  const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
  const token = requiredEnv('CLOUDFLARE_D1_TOKEN');
  const response = await fetch(
    `${API_BASE}/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000)
    }
  );

  const payload = (await response.json()) as RawResponse;
  if (!payload.success) {
    const message = (payload.errors ?? []).map((item) => item.message).join('; ');
    throw new Error(`D1 请求失败（${response.status}）：${message || '未知错误'}`);
  }
  return payload.result ?? [];
}

export async function d1Query(
  databaseId: string,
  sql: string,
  params: unknown[] = []
): Promise<D1Result> {
  const [result] = await callD1(databaseId, { sql, params });
  return {
    results: result?.results ?? [],
    changes: result?.meta?.changes ?? 0
  };
}

export async function d1Batch(
  databaseId: string,
  statements: D1Statement[]
): Promise<D1Result[]> {
  const results = await callD1(databaseId, {
    batch: statements.map((statement) => ({
      sql: statement.sql,
      params: statement.params ?? []
    }))
  });
  return results.map((result) => ({
    results: result.results ?? [],
    changes: result.meta?.changes ?? 0
  }));
}
