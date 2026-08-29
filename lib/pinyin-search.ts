import { pinyin } from 'pinyin-pro';

// 未命中的代价，任何真实命中代价都远小于它
export const MATCH_MISS = 1_000_000;

// 单字候选：全部读音 + 对应首字母，外加整串分词结果（保留旧的包含式匹配）
type TextEntry = {
  readings: string[][];
  initials: string[][];
  full: string;
  initialsText: string;
};

const entryCache = new Map<string, TextEntry>();

const LATIN_QUERY = /^[a-z0-9]+$/;
const MAX_QUERY_LENGTH = 60;

function getEntry(text: string): TextEntry {
  const cached = entryCache.get(text);
  if (cached) return cached;

  const readings: string[][] = [];
  const initials: string[][] = [];
  // 逐字取读音：整串转换会被分词锁死，多音字只留下一个读音
  for (const char of Array.from(text)) {
    const converted = pinyin(char, { type: 'array', toneType: 'none', multiple: true });
    const candidates = converted.map(item => item.toLowerCase()).filter(item => item.length > 0);
    const reading = candidates.length > 0 ? candidates : [char.toLowerCase()];
    readings.push(reading);
    initials.push(Array.from(new Set(reading.map(item => item[0]))));
  }

  const entry: TextEntry = {
    readings,
    initials,
    full: pinyin(text, { toneType: 'none', separator: '', nonZh: 'consecutive' }).toLowerCase(),
    initialsText: pinyin(text, { pattern: 'first', toneType: 'none', separator: '', nonZh: 'consecutive' }).toLowerCase()
  };
  entryCache.set(text, entry);
  return entry;
}

let costBuffer = new Int32Array(61 * 61);

/**
 * 逐字动态规划：query 只被逐字符消耗，从不被切分音节。
 * 每个字可以选择全拼（0 分）或首字母（1 分），读音必须精确相等；
 * query 若在某个音节中途结束，该音节按前缀匹配记 1 分。
 */
function dpCost(query: string, entry: TextEntry): number {
  const m = query.length;
  const n = entry.readings.length;
  if (m > MAX_QUERY_LENGTH || n === 0) return MATCH_MISS;

  const width = m + 1;
  const size = (n + 1) * width;
  if (costBuffer.length < size) costBuffer = new Int32Array(size);
  costBuffer.fill(MATCH_MISS, 0, size);
  // query 可以从任意一个字的边界开始
  for (let i = 0; i <= n; i++) costBuffer[i * width] = 0;

  for (let i = 0; i < n; i++) {
    const readings = entry.readings[i];
    const initials = entry.initials[i];
    for (let k = 0; k < m; k++) {
      const base = costBuffer[i * width + k];
      if (base >= MATCH_MISS) continue;
      const row = (i + 1) * width;

      for (const reading of readings) {
        if (query.startsWith(reading, k)) {
          const target = row + k + reading.length;
          if (base < costBuffer[target]) costBuffer[target] = base;
          continue;
        }
        // query 在音节中途结束：最后一个音节允许只读了一半，例如 pingyu 命中 清平乐
        const remaining = m - k;
        if (remaining < reading.length && reading.startsWith(query.slice(k))) {
          const target = row + m;
          if (base + 1 < costBuffer[target]) costBuffer[target] = base + 1;
        }
      }

      for (const initial of initials) {
        if (query[k] === initial) {
          const target = row + k + 1;
          if (base + 1 < costBuffer[target]) costBuffer[target] = base + 1;
        }
      }
    }
  }

  let best = MATCH_MISS;
  for (let i = 0; i <= n; i++) {
    const value = costBuffer[i * width + m];
    if (value < best) best = value;
  }
  return best;
}

/**
 * 匹配代价，越小越精确：
 * 原文包含 0，全拼子串(可跨音节) 1，首字母串 每字 +1，
 * 动态规划路径内 全拼 +0 / 首字母 +1 / 末尾半个音节 +1。
 * 返回 MATCH_MISS 表示未命中。
 */
export function matchPinyinCost(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  if (text.toLowerCase().includes(q)) return 0;

  const entry = getEntry(text);
  let best = LATIN_QUERY.test(q) ? dpCost(q, entry) : MATCH_MISS;
  if (entry.full.includes(q) && 1 < best) best = 1;
  if (entry.initialsText.includes(q) && q.length < best) best = q.length;
  return best;
}

export function matchesPinyin(query: string, text: string): boolean {
  return matchPinyinCost(query, text) < MATCH_MISS;
}

export function matchPinyinArrayCost(query: string, items: string[]): number {
  if (!query.trim()) return 0;
  let best = MATCH_MISS;
  for (const item of items) {
    const cost = matchPinyinCost(query, item);
    if (cost < best) best = cost;
  }
  return best;
}

export function matchesPinyinArray(query: string, items: string[]): boolean {
  if (!query.trim()) return true;
  return items.some(item => matchesPinyin(query, item));
}

/**
 * 预热缓存，提前为一批字符串生成拼音，避免首次搜索时卡顿
 */
export function preloadPinyinCache(texts: string[]): void {
  texts.forEach(getEntry);
}
