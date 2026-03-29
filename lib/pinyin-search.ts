import { pinyin } from 'pinyin-pro';

// 模块级缓存：页面生命周期内每个字符串只转换一次
const pinyinCache = new Map<string, { full: string; initials: string }>();

function getPinyinEntry(text: string) {
  if (pinyinCache.has(text)) return pinyinCache.get(text)!;
  const full = pinyin(text, { toneType: 'none', separator: '', nonZh: 'consecutive' }).toLowerCase();
  const initials = pinyin(text, { pattern: 'first', toneType: 'none', separator: '', nonZh: 'consecutive' }).toLowerCase();
  const entry = { full, initials };
  pinyinCache.set(text, entry);
  return entry;
}

/**
 * 检查查询字符串是否匹配给定文本，支持：
 * ① 直接字符串匹配（保留原有行为）
 * ② 全拼匹配：'qiansixi' → '牵丝戏'
 * ③ 首字母匹配：'qsx' → '牵丝戏'
 */
export function matchesPinyin(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  // ① 直接匹配（中文、英文、部分匹配）
  if (text.toLowerCase().includes(q)) return true;
  const { full, initials } = getPinyinEntry(text);
  // ② 全拼匹配：'qiansixi' 或 'sixi' 均能匹配 '牵丝戏'
  if (full.includes(q)) return true;
  // ③ 首字母匹配：'qsx' → '牵丝戏'
  if (initials.includes(q)) return true;
  return false;
}

/**
 * 检查查询字符串是否匹配数组中的任意一项（用于歌手、标签等数组字段）
 */
export function matchesPinyinArray(query: string, items: string[]): boolean {
  if (!query.trim()) return true;
  return items.some(item => matchesPinyin(query, item));
}

/**
 * 预热缓存，提前为一批字符串生成拼音，避免首次搜索时卡顿
 */
export function preloadPinyinCache(texts: string[]): void {
  texts.forEach(getPinyinEntry);
}
