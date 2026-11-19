'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useDeferredValue, useRef, Fragment, type CSSProperties } from 'react';
import { CreateSongRequest, EnsembleType, Song } from '@/types/song';
import { matchPinyinArrayCost, matchPinyinCost, matchesPinyin, matchesPinyinArray, preloadPinyinCache } from '@/lib/pinyin-search';

// 从环境变量读取密码，默认为 'daisy2024'
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_SONGLIST_PASSWORD?.trim() || 'daisy2024';
const ADMIN_KEY = 'isAdmin';
const ENSEMBLE_OPTIONS: { value: EnsembleType; label: string }[] = [
  { value: 'none', label: 'none' },
  { value: 'duet', label: '对唱' },
  { value: 'chorus', label: '合唱' }
];
const EMPTY_ENSEMBLE_FILTER: Record<EnsembleType, boolean> = {
  none: false,
  duet: false,
  chorus: false
};

const MAX_AUDIO_DURATION_SECONDS = 150;

// 双击 Escape 的判定窗口（毫秒）
const DOUBLE_ESCAPE_INTERVAL_MS = 400;

type AudioCacheEntry = {
  src: string;
  updatedAt?: string;
};

function normalizeEnsembleType(value: Song['ensembleType']): EnsembleType {
  return value === 'duet' || value === 'chorus' ? value : 'none';
}

// 读取文件为 base64（去掉 data URL 前缀）
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      resolve(result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('读取音频文件失败'));
    reader.readAsDataURL(file);
  });
}

// 通过 audio 元素读取音频时长（秒）
function getAudioDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取音频时长'));
    };
    audio.src = url;
  });
}

function getEnsembleIcon(value: Song['ensembleType']) {
  const ensembleType = normalizeEnsembleType(value);
  if (ensembleType === 'duet') return '👫';
  if (ensembleType === 'chorus') return '👥';
  return null;
}

function EnsembleTypeControl({
  value,
  onChange,
  compact = false,
  grouped = false
}: {
  value: EnsembleType;
  onChange: (value: EnsembleType) => void;
  compact?: boolean;
  grouped?: boolean;
}) {
  if (grouped) {
    return (
      <div
        data-testid="edit-ensemble-group"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          width: '100%',
          height: '40px',
          boxSizing: 'border-box',
          background: '#fff5f8',
          border: '2px solid #ffd6e7',
          borderRadius: '14px',
          padding: '0 5px'
        }}
      >
        {ENSEMBLE_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '28px',
                lineHeight: 1,
                background: selected ? '#ff6b9d' : '#ffffff',
                color: selected ? 'white' : '#ff8fab',
                border: selected ? '2px solid #ff6b9d' : '2px solid #ffd6e7',
                padding: '0 6px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                opacity: selected ? 1 : 0.6,
                transition: 'all 0.2s ease'
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: compact ? '6px' : '8px'
    }}>
      {ENSEMBLE_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              padding: compact ? '8px 12px' : '10px 14px',
              borderRadius: compact ? '10px' : '12px',
              border: selected ? '2px solid #ff6b9d' : '2px solid #ffd6e7',
              background: selected ? '#fff5f8' : '#ffffff',
              color: selected ? '#ff6b9d' : '#ff8fab',
              cursor: 'pointer',
              fontSize: compact ? '13px' : '14px',
              fontWeight: 'bold',
              minWidth: compact ? '64px' : '72px',
              transition: 'all 0.2s ease'
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Iconify andrsrxn:pin 图标
function PinIcon({ size = 16, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: 'block', flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <g fill="none">
        <path
          fill="currentColor"
          d="M5.9 14.38c-2-2-3-3.01-2.76-4.09c.24-1.07 1.57-1.55 4.25-2.5l5.34-1.91l.22-.08a2 2 0 0 0 1.23-1.82q.03-.49.06-.62a2 2 0 0 1 3.22-1.2l.45.44l3.42 3.43c.33.33.5.5.6.62a2 2 0 0 1-1.04 3.1c-.15.04-.38.08-.85.14l-.3.05a2 2 0 0 0-1.5 1.37l-2.13 5.37c-1.01 2.56-1.52 3.84-2.58 4.05c-1.05.22-2.02-.75-3.97-2.7z"
          opacity=".2"
        />
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M5.9 14.38c-2-2-3-3.01-2.76-4.09c.24-1.07 1.57-1.55 4.25-2.5l5.34-1.91l.22-.08a2 2 0 0 0 1.23-1.82q.03-.49.06-.62a2 2 0 0 1 3.22-1.2l.45.44l3.42 3.43c.33.33.5.5.6.62a2 2 0 0 1-1.04 3.1c-.15.04-.38.08-.85.14l-.3.05a2 2 0 0 0-1.5 1.37l-2.13 5.37c-1.01 2.56-1.52 3.84-2.58 4.05c-1.05.22-2.02-.75-3.97-2.7zM1.8 22.2l5.97-5.96"
        />
      </g>
    </svg>
  );
}

// Iconify andrsrxn:pin-off 图标
function PinOffIcon({ size = 16, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: 'block', flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <g fill="none">
        <path
          fill="currentColor"
          d="M5.9 14.38c-2-2-3-3.01-2.76-4.09c.24-1.07 1.57-1.55 4.25-2.5l5.34-1.91l.22-.08a2 2 0 0 0 1.23-1.82q.03-.49.06-.62a2 2 0 0 1 3.22-1.2l.45.44l3.42 3.43c.33.33.5.5.6.62a2 2 0 0 1-1.04 3.1c-.15.04-.38.08-.85.14l-.3.05a2 2 0 0 0-1.5 1.37l-2.13 5.37c-1.01 2.56-1.52 3.84-2.58 4.05c-1.05.22-2.02-.75-3.97-2.7z"
          opacity=".2"
        />
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="m2.7 2.7l18.6 18.6M7.62 7.74l-.18.07c-2.7.94-4.04 1.42-4.29 2.5c-.24 1.07.76 2.08 2.78 4.1l3.64 3.64c1.94 1.94 2.91 2.9 3.97 2.69c1.05-.22 1.56-1.49 2.58-4.03l.16-.4M1.8 22.2l5.97-5.96m2.8-9.6l2.16-.77l.21-.08a2 2 0 0 0 1.22-1.58l.02-.23c.02-.34.04-.51.06-.62a2 2 0 0 1 3.22-1.2l.44.44l3.43 3.42c.33.34.5.5.6.63a2 2 0 0 1-1.04 3.1c-.15.04-.38.08-.85.14l-.3.05a2 2 0 0 0-1.5 1.36l-.9 2.25"
        />
      </g>
    </svg>
  );
}

// 卡片左上角斜插图钉装饰（一半在卡片外，一半在卡片内）
function PinnedCornerPin({ size = 22, offset = -10 }: { size?: number; offset?: number }) {
  return (
    <div
      data-testid="pinned-corner-pin"
      style={{
        position: 'absolute',
        top: `${offset}px`,
        left: `${offset}px`,
        color: '#d95d39',
        pointerEvents: 'none',
        zIndex: 2,
        filter: 'drop-shadow(0 2px 3px rgba(217, 93, 57, 0.35))'
      }}
    >
      <PinIcon size={size} style={{ transform: 'scaleX(-1)' }} />
    </div>
  );
}

/**
 * 对歌曲列表进行排序
 * 排序优先级：pinned > 歌手名 > 歌曲名 > key绝对值
 */
function sortSongs(songs: Song[]): Song[] {
  return [...songs].sort((a, b) => {
    const pinnedDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    if (pinnedDiff !== 0) return pinnedDiff;

    // 1. 按第一个歌手名排序（字母顺序）
    const singerA = a.singers[0] || '';
    const singerB = b.singers[0] || '';
    const singerCompare = singerA.localeCompare(singerB, 'zh-CN');
    if (singerCompare !== 0) return singerCompare;

    // 2. 按歌曲名排序（字母顺序）
    const nameCompare = a.name.localeCompare(b.name, 'zh-CN');
    if (nameCompare !== 0) return nameCompare;

    // 3. 按key绝对值排序（从小到大），未定调(null)排最后
    const keyA = a.key === null ? 999 : Math.abs(a.key);
    const keyB = b.key === null ? 999 : Math.abs(b.key);
    return keyA - keyB;
  });
}

export default function Home() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLoadingSongs, setIsLoadingSongs] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // 表单状态（添加）
  const [name, setName] = useState('');
  const [singersInput, setSingersInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [key, setKey] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [featured, setFeatured] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [ensembleType, setEnsembleType] = useState<EnsembleType>('none');

  // 搜索框状态与 DOM 引用（保留 hydration 之前用户已输入的内容）
  const [searchName, setSearchName] = useState('');
  const [searchSinger, setSearchSinger] = useState('');
  const [searchTag, setSearchTag] = useState('');
  const searchNameInputRef = useRef<HTMLInputElement>(null);
  const searchSingerInputRef = useRef<HTMLInputElement>(null);
  const searchTagInputRef = useRef<HTMLInputElement>(null);

  // 拼音搜索：使用 useDeferredValue 保持输入框即时响应
  const deferredName   = useDeferredValue(searchName);
  const deferredSinger = useDeferredValue(searchSinger);
  const deferredTag    = useDeferredValue(searchTag);

  // 主打歌筛选状态
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);

  // 置顶歌曲筛选状态
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  // 仅显示带音频的歌曲筛选状态（默认关闭）
  const [showAudioOnly, setShowAudioOnly] = useState(false);

  // 合唱类型筛选状态（默认不选；不选时等同于全选）
  const [ensembleFilter, setEnsembleFilter] = useState<Record<EnsembleType, boolean>>(EMPTY_ENSEMBLE_FILTER);

  const toggleEnsembleFilter = (type: EnsembleType) => {
    setEnsembleFilter(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isRandomPick, setIsRandomPick] = useState(false);
  const [pinningSongId, setPinningSongId] = useState<string | null>(null);

  // 编辑表单状态
  const [editName, setEditName] = useState('');
  const [editSingersInput, setEditSingersInput] = useState('');
  const [editTagsInput, setEditTagsInput] = useState('');
  const [editKey, setEditKey] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editFeatured, setEditFeatured] = useState(false);
  const [editPinned, setEditPinned] = useState(false);
  const [editEnsembleType, setEditEnsembleType] = useState<EnsembleType>('none');

  // 音频编辑状态
  const [editAudioFile, setEditAudioFile] = useState<File | null>(null);
  const [editAudioDuration, setEditAudioDuration] = useState<number | null>(null);
  const [editAudioRemoved, setEditAudioRemoved] = useState(false);
  const [editAudioError, setEditAudioError] = useState('');
  const [editAudioDragging, setEditAudioDragging] = useState(false);

  // 歌词弹窗状态
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [lyricsEditing, setLyricsEditing] = useState(false);
  const [lyricsText, setLyricsText] = useState('');
  const [lyricsSaving, setLyricsSaving] = useState(false);

  // 查看模式的音频播放
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const audioCacheRef = useRef<Record<string, AudioCacheEntry>>({});

  // 客户端缓存
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const CACHE_DURATION = 30000; // 30秒缓存

  // 认证状态
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // 检查本地存储的登录状态
  useEffect(() => {
    const adminStatus = localStorage.getItem(ADMIN_KEY);
    if (adminStatus === 'true') {
      setIsAdmin(true);
    }
  }, []);

  // 处理登录
  const handleLogin = () => {
    if (loginPassword === ADMIN_PASSWORD) {
      setIsAdmin(true);
      localStorage.setItem(ADMIN_KEY, 'true');
      setShowLoginModal(false);
      setLoginPassword('');
      setLoginError('');
    } else {
      setLoginError('密码错误');
    }
  };

  // 处理登出
  const handleLogout = () => {
    setIsAdmin(false);
    localStorage.removeItem(ADMIN_KEY);
    setShowForm(false);
    setIsEditing(false);
  };

  // 打开登录弹窗
  const openLoginModal = () => {
    setShowLoginModal(true);
    setLoginPassword('');
    setLoginError('');
  };

  const fetchSongs = async (forceRefresh = false) => {
    // 检查缓存
    if (!forceRefresh && Date.now() - lastFetchTime < CACHE_DURATION && songs.length > 0) {
      return;
    }

    setIsLoadingSongs(true);
    try {
      const response = await fetch('/api/songs');
      const data = await response.json();
      if (data.success) {
        setSongs(data.data);
        setLastFetchTime(Date.now());
      }
    } catch (error) {
      console.error('获取歌曲列表失败:', error);
    } finally {
      setIsLoadingSongs(false);
    }
  };

  // 挂载时同步用户在 hydration 完成前已输入到搜索框的内容
  useLayoutEffect(() => {
    const initialName = searchNameInputRef.current?.value ?? '';
    const initialSinger = searchSingerInputRef.current?.value ?? '';
    const initialTag = searchTagInputRef.current?.value ?? '';
    if (initialName) setSearchName(initialName);
    if (initialSinger) setSearchSinger(initialSinger);
    if (initialTag) setSearchTag(initialTag);
  }, []);

  // 数据加载后预热拼音缓存，确保首次搜索时无延迟
  useEffect(() => {
    if (!songs.length) return;
    const texts = new Set<string>();
    songs.forEach(s => {
      texts.add(s.name);
      s.singers.forEach(x => texts.add(x));
      s.tags.forEach(x => texts.add(x));
    });
    const timer = window.setTimeout(() => preloadPinyinCache(Array.from(texts)), 0);
    return () => window.clearTimeout(timer);
  }, [songs]);

  // 过滤并排序歌曲（支持拼音搜索）
  const filteredSongs = useMemo(() => {
    const hasEnsembleFilter = Object.values(ensembleFilter).some(Boolean);

    const filtered = songs.filter(song => {
      // 主打歌筛选
      if (showFeaturedOnly && !song.featured) {
        return false;
      }

      // 置顶歌曲筛选
      if (showPinnedOnly && !song.pinned) {
        return false;
      }

      // 仅显示带音频的歌曲
      if (showAudioOnly && !song.hasAudio) {
        return false;
      }

      // 合唱类型筛选
      if (hasEnsembleFilter && !ensembleFilter[normalizeEnsembleType(song.ensembleType)]) {
        return false;
      }

      // 歌名搜索（支持拼音/首字母）
      if (deferredName && !matchesPinyin(deferredName, song.name)) {
        return false;
      }

      // 歌手搜索（支持拼音/首字母）
      if (deferredSinger && !matchesPinyinArray(deferredSinger, song.singers)) {
        return false;
      }

      // Tag 搜索（支持拼音/首字母）
      if (deferredTag && !matchesPinyinArray(deferredTag, song.tags)) {
        return false;
      }

      return true;
    });

    // 先按 pinned/歌手/歌名/key 排，再按匹配代价稳定排序，精确命中排在模糊命中之前
    const scored = sortSongs(filtered).map(song => {
      let cost = 0;
      if (deferredName) cost += matchPinyinCost(deferredName, song.name);
      if (deferredSinger) cost += matchPinyinArrayCost(deferredSinger, song.singers);
      if (deferredTag) cost += matchPinyinArrayCost(deferredTag, song.tags);
      return { song, cost };
    });

    scored.sort((a, b) => a.cost - b.cost);
    return scored.map(item => item.song);
  }, [songs, deferredName, deferredSinger, deferredTag, showFeaturedOnly, showPinnedOnly, showAudioOnly, ensembleFilter]);

  // 清除所有搜索
  const clearAllFilters = useCallback(() => {
    if (searchNameInputRef.current) searchNameInputRef.current.value = '';
    if (searchSingerInputRef.current) searchSingerInputRef.current.value = '';
    if (searchTagInputRef.current) searchTagInputRef.current.value = '';
    setSearchName('');
    setSearchSinger('');
    setSearchTag('');
    setShowFeaturedOnly(false);
    setShowPinnedOnly(false);
    setShowAudioOnly(false);
    setEnsembleFilter(EMPTY_ENSEMBLE_FILTER);
  }, []);

  // 页面内任意位置双击 Escape 清除所有搜索条件
  const lastEscapeAtRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat) return;

      const now = Date.now();
      if (now - lastEscapeAtRef.current <= DOUBLE_ESCAPE_INTERVAL_MS) {
        lastEscapeAtRef.current = 0;
        clearAllFilters();
        return;
      }
      lastEscapeAtRef.current = now;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearAllFilters]);

  // 已生效的搜索条件，每种条件一张卡片，卡片之间是「与」，卡片内部多个取值是「或」
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; field: string; values: string[] }[] = [];
    const name = searchName.trim();
    const singer = searchSinger.trim();
    const tag = searchTag.trim();
    if (name) chips.push({ key: 'name', field: '歌名', values: [name] });
    if (singer) chips.push({ key: 'singer', field: '歌手', values: [singer] });
    if (tag) chips.push({ key: 'tag', field: '标签', values: [tag] });
    if (showFeaturedOnly) chips.push({ key: 'featured', field: '', values: ['⭐ featured'] });
    if (showPinnedOnly) chips.push({ key: 'pinned', field: '', values: ['pinned'] });
    if (showAudioOnly) chips.push({ key: 'audio', field: '', values: ['🎧 仅带音频'] });
    const ensembles = ENSEMBLE_OPTIONS.filter(option => ensembleFilter[option.value]).map(option => option.label);
    if (ensembles.length) chips.push({ key: 'ensemble', field: '类型', values: ensembles });
    return chips;
  }, [searchName, searchSinger, searchTag, showFeaturedOnly, showPinnedOnly, showAudioOnly, ensembleFilter]);

  const addSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('请先登录管理员账号');
      return;
    }
    setLoading(true);

    try {
      const singers = singersInput.split(/[,，]/).map(s => s.trim()).filter(s => s);
      const tags = tagsInput.split(/[,，]/).map(t => t.trim()).filter(t => t);

      const request: CreateSongRequest = {
        name,
        singers,
        tags,
        key,
        notes: notes.trim() || undefined,
        featured,
        pinned,
        ensembleType
      };

      const response = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      const data = await response.json();
      if (data.success) {
        setName('');
        setSingersInput('');
        setTagsInput('');
        setKey(0);
        setNotes('');
        setFeatured(false);
        setPinned(false);
        setEnsembleType('none');
        setShowForm(false);
        fetchSongs(true);
      } else {
        alert(data.error || '添加失败');
      }
    } catch (error) {
      console.error('添加歌曲失败:', error);
      alert('添加失败');
    } finally {
      setLoading(false);
    }
  };

  // 一键切换歌曲 pin 状态
  const togglePinSong = async (song: Song) => {
    if (!isAdmin || pinningSongId === song.id) return;
    const nextPinned = !song.pinned;
    setPinningSongId(song.id);
    try {
      const response = await fetch(`/api/songs/${song.id}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: nextPinned })
      });
      const data = await response.json();
      if (!data.success) {
        alert(data.error || '更新置顶状态失败');
        return;
      }
      const updatedSong: Song = data.data;
      setSongs(prev => prev.map(s => s.id === updatedSong.id ? updatedSong : s));
      setSelectedSong(prev => prev?.id === updatedSong.id ? updatedSong : prev);
    } catch (error) {
      console.error('更新置顶状态失败:', error);
      alert('更新置顶状态失败');
    } finally {
      setPinningSongId(null);
    }
  };

  const removeSong = async (id: string) => {
    if (!isAdmin) {
      alert('请先登录管理员账号');
      return;
    }
    if (!confirm('确定要删除这首歌吗？')) return;

    try {
      const response = await fetch(`/api/songs/${id}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {
        if (selectedSong?.id === id) {
          setSelectedSong(null);
          setIsEditing(false);
        }
        fetchSongs(true);
      } else {
        alert(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除歌曲失败:', error);
      alert('删除失败');
    }
  };

  // 开始编辑
  const startEdit = () => {
    if (!selectedSong) return;
    setEditName(selectedSong.name);
    setEditSingersInput(selectedSong.singers.join(', '));
    setEditTagsInput(selectedSong.tags.join(', '));
    setEditKey(selectedSong.key);
    setEditNotes(selectedSong.notes || '');
    setEditFeatured(selectedSong.featured || false);
    setEditPinned(selectedSong.pinned || false);
    setEditEnsembleType(normalizeEnsembleType(selectedSong.ensembleType));
    setEditAudioFile(null);
    setEditAudioDuration(null);
    setEditAudioRemoved(false);
    setEditAudioError('');
    setIsEditing(true);
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditAudioFile(null);
    setEditAudioDuration(null);
    setEditAudioRemoved(false);
    setEditAudioError('');
    setIsEditing(false);
  };

  // 音频文件的客户端校验（供选择与拖拽共用）
  const processAudioFile = async (file: File) => {
    setEditAudioError('');

    const isMp3 = file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3');
    if (!isMp3) {
      setEditAudioError('只允许上传 MP3 文件');
      setEditAudioFile(null);
      setEditAudioDuration(null);
      return;
    }

    const duration = await getAudioDurationSeconds(file);
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_AUDIO_DURATION_SECONDS) {
      setEditAudioError(`音频时长必须大于 0 且不超过 ${MAX_AUDIO_DURATION_SECONDS} 秒`);
      setEditAudioFile(null);
      setEditAudioDuration(null);
      return;
    }

    setEditAudioFile(file);
    setEditAudioDuration(duration);
    setEditAudioRemoved(false);
  };

  const handleEditAudioChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processAudioFile(file);
    e.target.value = '';
  };

  const handleEditAudioDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setEditAudioDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processAudioFile(file);
  };

  // 保存编辑
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('请先登录管理员账号');
      return;
    }
    if (!selectedSong) return;

    setLoading(true);
    try {
      const singers = editSingersInput.split(/[,，]/).map(s => s.trim()).filter(s => s);
      const tags = editTagsInput.split(/[,，]/).map(t => t.trim()).filter(t => t);

      const response = await fetch(`/api/songs/${selectedSong.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          singers,
          tags,
          key: editKey,
          notes: editNotes.trim() || undefined,
          featured: editFeatured,
          pinned: editPinned,
          ensembleType: editEnsembleType
        })
      });

      const data = await response.json();
      if (!data.success) {
        alert(data.error || '更新失败');
        return;
      }

      let updatedSong: Song = data.data;

      if (editAudioFile) {
        const base64 = await readFileAsBase64(editAudioFile);
        const audioResponse = await fetch(`/api/songs/${selectedSong.id}/audio`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64,
            fileName: editAudioFile.name,
            contentType: 'audio/mpeg',
            durationSeconds: editAudioDuration
          })
        });
        const audioData = await audioResponse.json();
        if (!audioData.success) {
          alert(audioData.error || '音频上传失败');
          return;
        }
        updatedSong = audioData.data;
        audioCacheRef.current[selectedSong.id] = {
          src: `data:audio/mpeg;base64,${base64}`,
          updatedAt: updatedSong.audioMeta?.updatedAt
        };
      } else if (editAudioRemoved && selectedSong.hasAudio) {
        const deleteResponse = await fetch(`/api/songs/${selectedSong.id}/audio`, {
          method: 'DELETE'
        });
        const deleteData = await deleteResponse.json();
        if (!deleteData.success) {
          alert(deleteData.error || '音频移除失败');
          return;
        }
        updatedSong = deleteData.data;
        delete audioCacheRef.current[selectedSong.id];
      }

      setIsEditing(false);
      setSelectedSong(updatedSong);
      setEditAudioFile(null);
      setEditAudioDuration(null);
      setEditAudioRemoved(false);
      setEditAudioError('');
      fetchSongs(true);
    } catch (error) {
      console.error('更新歌曲失败:', error);
      alert('更新失败');
    } finally {
      setLoading(false);
    }
  };

  // 歌词弹窗打开时锁定背景滚动
  useEffect(() => {
    if (!showLyricsModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showLyricsModal]);

  // 打开歌词弹窗
  const openLyricsModal = () => {
    if (!selectedSong) return;
    setLyricsText(selectedSong.lyrics || '');
    setLyricsEditing(false);
    setShowLyricsModal(true);
  };

  // 保存歌词
  const saveLyrics = async () => {
    if (!isAdmin || !selectedSong) return;
    setLyricsSaving(true);
    try {
      const response = await fetch(`/api/songs/${selectedSong.id}/lyrics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: lyricsText })
      });
      const data = await response.json();
      if (!data.success) {
        alert(data.error || '歌词保存失败');
        return;
      }
      setSelectedSong(data.data);
      setSongs(prev => prev.map(s => s.id === data.data.id ? data.data : s));
      setLyricsEditing(false);
    } catch (error) {
      console.error('保存歌词失败:', error);
      alert('保存失败');
    } finally {
      setLyricsSaving(false);
    }
  };

  const formatKey = (key: number | null) => {
    if (key === null) return '未定调';
    if (key > 0) return `+${key}`;
    if (key < 0) return `${key}`;
    return '原调';
  };

  const pickRandomSong = () => {
    if (songs.length === 0) return;
    const randomIndex = Math.floor(Math.random() * songs.length);
    setSelectedSong(songs[randomIndex]);
    setIsEditing(false);
    setIsRandomPick(true);
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  // 查看模式下加载选中歌曲的音频用于试听
  useEffect(() => {
    if (!selectedSong || isEditing || !selectedSong.hasAudio) {
      if (selectedSong && !selectedSong.hasAudio) {
        delete audioCacheRef.current[selectedSong.id];
      }
      setAudioSrc(null);
      setAudioLoading(false);
      return;
    }

    const songId = selectedSong.id;
    const updatedAt = selectedSong.audioMeta?.updatedAt;
    const cachedAudio = audioCacheRef.current[songId];

    if (cachedAudio && cachedAudio.updatedAt === updatedAt) {
      setAudioSrc(cachedAudio.src);
      setAudioLoading(false);
      return;
    }

    let cancelled = false;
    setAudioSrc(null);
    setAudioLoading(true);
    fetch(`/api/songs/${songId}/audio`)
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          const src = `data:${data.data.contentType};base64,${data.data.base64}`;
          audioCacheRef.current[songId] = {
            src,
            updatedAt: data.data.updatedAt
          };
          if (!cancelled) {
            setAudioSrc(src);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setAudioLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSong?.id, selectedSong?.hasAudio, selectedSong?.audioMeta?.updatedAt, isEditing]);

  // 搜索框样式 - 浅粉色主题
  const searchInputStyle: CSSProperties = {
    padding: '12px 16px',
    borderRadius: '20px',
    border: '2px solid #ffd6e7',
    fontSize: '14px',
    background: '#fff8fb',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.3s ease'
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#fffafd'
    }}>
      <main style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '16px',
        minHeight: '100vh'
      }}>
        <style dangerouslySetInnerHTML={{ __html: `
          .main-layout {
            display: grid;
            grid-template-columns: calc((100% - 16px) * 0.64) minmax(0, 1fr);
            grid-template-rows: auto 1fr;
            column-gap: 16px;
            align-items: start;
          }
          .top-left-panel {
            grid-column: 1;
            grid-row: 1;
            min-width: 0;
          }
          .left-panel {
            grid-column: 1;
            grid-row: 2;
            min-width: 0;
          }
          .right-panel {
            grid-column: 2;
            grid-row: 1 / 3;
            min-width: 0;
            position: sticky;
            top: 16px;
          }
          .search-panel {
            width: 100%;
            box-sizing: border-box;
          }
          .search-controls {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 12px;
          }
          .search-inputs-row {
            display: flex;
            gap: 8px;
            align-items: center;
          }
          .search-filters-row {
            display: flex;
            gap: 8px;
            align-items: center;
            justify-content: flex-start;
            flex-wrap: wrap;
          }
          .search-input {
            flex: 1;
            min-width: 0;
          }
          .song-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
            align-items: start;
          }
          .song-column {
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 0;
          }
          .song-detail-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
          }
          .song-detail-title {
            flex: 1;
            min-width: 0;
            margin: 0;
            overflow: hidden;
            color: #ff6b9d;
            font-size: 20px;
            font-weight: bold;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .song-detail-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @media (max-width: 768px) {
            .main-layout {
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              column-gap: 16px;
            }
            .top-left-panel {
              grid-column: 1 / 3;
              grid-row: 1;
            }
            .left-panel {
              grid-column: 1;
              grid-row: 2;
            }
            .right-panel {
              grid-column: 2;
              grid-row: 2;
              position: static;
            }
            .search-controls {
              flex-direction: row;
              flex-wrap: wrap;
              gap: 8px;
              align-items: center;
            }
            .search-inputs-row,
            .search-filters-row {
              display: contents;
            }
            .search-input {
              min-width: 150px;
            }
            .song-grid { grid-template-columns: 1fr; }
            .detail-bottom-actions {
              gap: 6px !important;
            }
            .detail-icon-btn {
              width: 36px !important;
              height: 36px !important;
              border-radius: 10px !important;
            }
            .detail-edit-btn {
              padding: 8px 10px !important;
              font-size: 13px !important;
              white-space: nowrap;
              border-radius: 12px !important;
            }
            .song-detail-header {
              align-items: flex-start;
              flex-wrap: wrap;
            }
            .song-detail-title {
              flex-basis: 100%;
              overflow: visible;
              overflow-wrap: anywhere;
              text-overflow: clip;
              white-space: normal;
            }
            .song-detail-actions {
              flex-wrap: wrap;
              width: 100%;
            }
          }
        ` }} />
        {/* 登录弹窗 */}
        {showLoginModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255, 182, 193, 0.4)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: '#fff5f8',
              padding: '36px',
              borderRadius: '24px',
              width: '90%',
              maxWidth: '360px',
              boxShadow: '0 8px 32px rgba(255, 107, 157, 0.2)',
              border: '2px solid #ffd6e7'
            }}>
              <h2 style={{
                fontSize: '22px',
                marginBottom: '24px',
                color: '#ff6b9d',
                textAlign: 'center',
                fontWeight: 'bold'
              }}>请输入密码</h2>
              <input
                type="password"
                placeholder="密码"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                style={{
                  width: '100%',
                  padding: '14px 18px',
                  borderRadius: '20px',
                  border: '2px solid #ffd6e7',
                  fontSize: '16px',
                  marginBottom: '16px',
                  boxSizing: 'border-box',
                  background: '#fff8fb',
                  outline: 'none',
                  transition: 'all 0.3s ease'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#ff6b9d';
                  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 157, 0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#ffd6e7';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              {loginError && (
                <p style={{
                  color: '#ff4757',
                  fontSize: '14px',
                  marginBottom: '16px',
                  textAlign: 'center',
                  background: '#ffe0e0',
                  padding: '8px',
                  borderRadius: '8px'
                }}>{loginError}</p>
              )}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setShowLoginModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '20px',
                    border: '2px solid #ffd6e7',
                    background: '#fff5f8',
                    color: '#ff6b9d',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ffe8f0';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fff5f8';
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleLogin}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '20px',
                    border: 'none',
                    background: '#ff6b9d',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    boxShadow: '0 4px 12px rgba(255, 107, 157, 0.3)',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 107, 157, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 107, 157, 0.3)';
                  }}
                >
                  进入 ✨
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 歌词弹窗 */}
        {showLyricsModal && selectedSong && (
          <div
            onClick={() => setShowLyricsModal(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(255, 182, 193, 0.4)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000,
              padding: '16px'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff5f8',
                borderRadius: '24px',
                width: '100%',
                maxWidth: '640px',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 32px rgba(255, 107, 157, 0.25)',
                border: '2px solid #ffd6e7',
                overflow: 'hidden'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '16px 24px',
                borderBottom: '2px solid #ffd6e7',
                background: '#ffffff'
              }}>
                <h2 style={{
                  fontSize: '18px',
                  color: '#ff6b9d',
                  fontWeight: 'bold',
                  margin: 0,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  🎶 {selectedSong.name} 歌词
                </h2>
                {isAdmin && !lyricsEditing && (
                  <button
                    onClick={() => { setLyricsText(selectedSong.lyrics || ''); setLyricsEditing(true); }}
                    style={{
                      flexShrink: 0,
                      padding: '8px 14px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #ff6b9d 0%, #ff8fab 100%)',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      boxShadow: '0 3px 10px rgba(255, 107, 157, 0.3)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 5px 14px rgba(255, 107, 157, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 3px 10px rgba(255, 107, 157, 0.3)';
                    }}
                  >
                    ✏️ 编辑
                  </button>
                )}
                <button
                  onClick={() => setShowLyricsModal(false)}
                  title="关闭"
                  style={{
                    flexShrink: 0,
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: '2px solid #ffd6e7',
                    background: '#fff5f8',
                    color: '#ff6b9d',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ffe8f0';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fff5f8';
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{
                padding: '20px 24px',
                overflowY: 'auto',
                flex: 1
              }}>
                {lyricsEditing ? (
                  <textarea
                    value={lyricsText}
                    onChange={(e) => setLyricsText(e.target.value)}
                    placeholder="粘贴或输入歌词，每行一句..."
                    style={{
                      width: '100%',
                      minHeight: '300px',
                      padding: '14px 16px',
                      borderRadius: '16px',
                      border: '2px solid #ffd6e7',
                      fontSize: '14px',
                      lineHeight: '1.8',
                      boxSizing: 'border-box',
                      background: '#fff8fb',
                      outline: 'none',
                      resize: 'vertical',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#ff6b9d';
                      e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 157, 0.15)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ffd6e7';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                ) : selectedSong.lyrics ? (
                  <div style={{
                    fontSize: '14px',
                    lineHeight: '1.8',
                    color: '#333',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {selectedSong.lyrics}
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    padding: '48px 20px',
                    color: '#ff8fab',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '36px', opacity: 0.6 }}>🎶</div>
                    <p style={{ fontSize: '14px', fontWeight: '500', margin: 0 }}>暂无歌词</p>
                    {isAdmin && (
                      <button
                        onClick={() => { setLyricsText(''); setLyricsEditing(true); }}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '12px',
                          border: '2px solid #ffd6e7',
                          background: '#fff5f8',
                          color: '#ff6b9d',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          transition: 'all 0.3s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#ffe8f0';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#fff5f8';
                        }}
                      >
                        ✏️ 添加歌词
                      </button>
                    )}
                  </div>
                )}
              </div>
              {lyricsEditing && (
                <div style={{
                  display: 'flex',
                  gap: '10px',
                  padding: '16px 24px',
                  borderTop: '2px solid #ffd6e7',
                  background: '#ffffff'
                }}>
                  <button
                    onClick={() => { setLyricsText(selectedSong.lyrics || ''); setLyricsEditing(false); }}
                    style={{
                      flex: 1,
                      background: '#fff5f8',
                      color: '#ff6b9d',
                      border: '2px solid #ffd6e7',
                      padding: '12px 20px',
                      borderRadius: '16px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#ffe8f0';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#fff5f8';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    取消
                  </button>
                  <button
                    onClick={saveLyrics}
                    disabled={lyricsSaving}
                    style={{
                      flex: 1,
                      background: lyricsSaving ? '#ffd6e7' : '#ff6b9d',
                      color: 'white',
                      border: 'none',
                      padding: '12px 20px',
                      borderRadius: '16px',
                      cursor: lyricsSaving ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      boxShadow: lyricsSaving ? 'none' : '0 4px 12px rgba(255, 107, 157, 0.3)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!lyricsSaving) {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 107, 157, 0.4)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = lyricsSaving ? 'none' : '0 4px 12px rgba(255, 107, 157, 0.3)';
                    }}
                  >
                    {lyricsSaving ? '保存中... 💾' : '💾 保存歌词'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 标题栏 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          padding: '16px 20px',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 2px 12px rgba(255, 107, 157, 0.08)',
          border: '2px solid #ffd6e7'
        }}>
          <h1 style={{
            fontSize: '34px',
            fontWeight: 'bold',
            color: '#ff6b9d',
            margin: 0,
            textShadow: '2px 2px 4px rgba(255, 107, 157, 0.15)'
          }}>
            🎵 Daisy的歌单
          </h1>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {isAdmin ? (
              <>
                <span style={{
                  color: '#ff6b9d',
                  fontSize: '14px',
                  background: '#ffe8f0',
                  padding: '6px 12px',
                  borderRadius: '12px',
                  fontWeight: 'bold'
                }}>✨ 已解锁</span>
                <button
                  onClick={handleLogout}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '20px',
                    border: '2px solid #ffd6e7',
                    background: '#fff5f8',
                    color: '#ff6b9d',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ffe8f0';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fff5f8';
                  }}
                >
                  退出
                </button>
              </>
            ) : (
              <button
                onClick={openLoginModal}
                style={{
                  padding: '10px 24px',
                  borderRadius: '20px',
                  border: 'none',
                  background: '#ff6b9d',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 12px rgba(255, 107, 157, 0.3)',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 107, 157, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 107, 157, 0.3)';
                }}
              >
                编辑模式 🔐
              </button>
            )}
          </div>
        </div>

        <div className="main-layout">
          <div className="top-left-panel">
            {/* 搜索区域 */}
            <div
              className="search-panel"
              style={{
                background: '#ffffff',
                padding: '16px',
                borderRadius: '16px',
                marginBottom: '16px',
                boxShadow: '0 2px 12px rgba(255, 107, 157, 0.08)',
                border: '2px solid #ffd6e7'
              }}
            >
          <div className="search-controls">
            <div className="search-inputs-row">
              <input
                ref={searchNameInputRef}
                type="text"
                className="search-input"
                placeholder="🔍 搜索歌名（支持拼音）..."
                defaultValue=""
                onChange={(e) => setSearchName(e.target.value)}
                style={searchInputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#ff6b9d';
                  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 157, 0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#ffd6e7';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <input
                ref={searchSingerInputRef}
                type="text"
                className="search-input"
                placeholder="🎤 搜索歌手（支持拼音）..."
                defaultValue=""
                onChange={(e) => setSearchSinger(e.target.value)}
                style={searchInputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#ff6b9d';
                  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 157, 0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#ffd6e7';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <input
                ref={searchTagInputRef}
                type="text"
                className="search-input"
                placeholder="🏷️ 搜索标签（支持拼音）..."
                defaultValue=""
                onChange={(e) => setSearchTag(e.target.value)}
                style={searchInputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#ff6b9d';
                  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 157, 0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#ffd6e7';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
            <div className="search-filters-row">
              <button
                type="button"
                onClick={() => setShowFeaturedOnly(!showFeaturedOnly)}
                style={{
                  background: showFeaturedOnly
                    ? '#8b0000'
                    : '#ffe4e1',
                  color: showFeaturedOnly ? 'white' : '#8b0000',
                  border: showFeaturedOnly ? '2px solid #8b0000' : '2px solid #ffc0cb',
                  padding: '10px 20px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {showFeaturedOnly ? '⭐ featured' : '☆ featured'}
              </button>
              <button
                type="button"
                onClick={() => setShowPinnedOnly(!showPinnedOnly)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: showPinnedOnly ? '#d95d39' : '#fff3ed',
                  color: showPinnedOnly ? 'white' : '#d95d39',
                  border: showPinnedOnly ? '2px solid #d95d39' : '2px solid #ffd0be',
                  padding: '10px 18px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <PinIcon size={15} />
                <span>pinned</span>
              </button>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                alignSelf: 'stretch',
                gap: '4px',
                background: '#fff5f8',
                border: '2px solid #ffd6e7',
                borderRadius: '16px',
                padding: '0 8px'
              }}>
                {ENSEMBLE_OPTIONS.map((option) => {
                    const active = ensembleFilter[option.value];
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleEnsembleFilter(option.value)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '28px',
                          lineHeight: 1,
                          background: active ? '#ff6b9d' : '#ffffff',
                          color: active ? 'white' : '#ff8fab',
                          border: active ? '2px solid #ff6b9d' : '2px solid #ffd6e7',
                          padding: '0 10px',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          whiteSpace: 'nowrap',
                          opacity: active ? 1 : 0.6,
                          transition: 'all 0.3s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
              </div>
              <button
                type="button"
                onClick={() => setShowAudioOnly(!showAudioOnly)}
                title="只显示带音频的歌曲"
                style={{
                  background: showAudioOnly ? '#ff6b9d' : '#fff5f8',
                  color: showAudioOnly ? 'white' : '#ff6b9d',
                  border: showAudioOnly ? '2px solid #ff6b9d' : '2px solid #ffd6e7',
                  padding: '10px 16px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                🎧
              </button>
            </div>
          </div>
          {activeFilterChips.length > 0 && (
            <div style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: '12px'
            }}>
              {activeFilterChips.map((chip, chipIndex) => (
                <Fragment key={chip.key}>
                  {chipIndex > 0 && (
                    <span style={{
                      color: '#ffb3c6',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      与
                    </span>
                  )}
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: '#fff5f8',
                    border: '2px solid #ffd6e7',
                    borderRadius: '12px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    color: '#ff6b9d',
                    whiteSpace: 'nowrap'
                  }}>
                    {chip.field && (
                      <span style={{ opacity: 0.65, marginRight: '4px' }}>{chip.field}</span>
                    )}
                    {chip.values.map((value, valueIndex) => (
                      <Fragment key={value}>
                        {valueIndex > 0 && (
                          <span style={{ opacity: 0.6, fontWeight: 'normal', margin: '0 4px' }}>或</span>
                        )}
                        {chip.key === 'pinned' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <PinIcon size={13} />
                            <span>{value}</span>
                          </span>
                        ) : (
                          <span>{value}</span>
                        )}
                      </Fragment>
                    ))}
                  </span>
                </Fragment>
              ))}
              <button
                onClick={clearAllFilters}
                title="清除搜索"
                aria-label="清除搜索"
                style={{
                  width: '26px',
                  height: '26px',
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#ffffff',
                  color: '#e53935',
                  border: '2px solid #e53935',
                  borderRadius: '50%',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  lineHeight: 1,
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e53935';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ffffff';
                  e.currentTarget.style.color = '#e53935';
                }}
              >
                ✕
              </button>
            </div>
          )}
          <div style={{
            color: '#ff8fab',
            fontSize: '14px',
            fontWeight: '500',
            padding: '8px 12px',
            background: '#fff5f8',
            borderRadius: '10px',
            display: 'inline-block'
          }}>
            🎵 共 <strong style={{ color: '#ff6b9d' }}>{songs.length}</strong> 首歌 / 展示 <strong style={{ color: '#ff6b9d' }}>{filteredSongs.length}</strong> 首歌
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          {isAdmin && (
            <button
              onClick={() => setShowForm(!showForm)}
              style={{
                background: showForm ? '#6c757d' : 'linear-gradient(135deg, #ff6b9d 0%, #ff8fab 100%)',
                color: 'white',
                border: 'none',
                padding: '14px 28px',
                borderRadius: '24px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                boxShadow: showForm ? '0 2px 8px rgba(0,0,0,0.1)' : '0 4px 16px rgba(255, 107, 157, 0.35)',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (!showForm) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 107, 157, 0.45)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = showForm ? '0 2px 8px rgba(0,0,0,0.1)' : '0 4px 16px rgba(255, 107, 157, 0.35)';
              }}
            >
              {showForm ? '取消' : '添加歌曲'}
            </button>
          )}
          <button
            onClick={pickRandomSong}
            disabled={songs.length === 0}
            style={{
              background: 'linear-gradient(135deg,rgb(239, 202, 80) 0%,rgb(249, 153, 105) 100%)',
              color: 'white',
              border: 'none',
              padding: '14px 28px',
              borderRadius: '24px',
              cursor: songs.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              boxShadow: '0 4px 16px rgba(246, 211, 101, 0.4)',
              transition: 'all 0.3s ease',
              opacity: songs.length === 0 ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (songs.length > 0) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(246, 211, 101, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(246, 211, 101, 0.4)';
            }}
          >
            🎲 随机一首
          </button>
        </div>
          </div>

          {/* 左侧：歌曲列表 + 新增表单 */}
          <div className="left-panel">
            {/* 新增表单（在showForm时显示在列表上方） */}
            {isAdmin && showForm && (
              <form
                onSubmit={addSong}
                style={{
                  background: '#ffffff',
                  padding: '20px',
                  borderRadius: '20px',
                  boxShadow: '0 2px 16px rgba(255, 107, 157, 0.1)',
                  border: '2px solid #ffd6e7',
                  marginBottom: '16px'
                }}
              >
                <h2 style={{
                  fontSize: '20px',
                  marginBottom: '20px',
                  color: '#ff6b9d',
                  fontWeight: 'bold'
                }}>新增歌曲</h2>

                {/* 第一行：song name | ref singer */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontWeight: 'bold',
                      color: '#ff6b9d',
                      fontSize: '13px'
                    }}>
                      🎵 歌曲名称 *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '2px solid #ffd6e7',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                        background: '#fff8fb',
                        outline: 'none',
                        transition: 'all 0.3s ease'
                      }}
                      placeholder="输入歌曲名称"
                      required
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#ff6b9d';
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 107, 157, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#ffd6e7';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontWeight: 'bold',
                      color: '#ff6b9d',
                      fontSize: '13px'
                    }}>
                      🎤 参考歌手 *
                    </label>
                    <input
                      type="text"
                      value={singersInput}
                      onChange={(e) => setSingersInput(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '2px solid #ffd6e7',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                        background: '#fff8fb',
                        outline: 'none',
                        transition: 'all 0.3s ease'
                      }}
                      placeholder="多个用逗号分隔"
                      required
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#ff6b9d';
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 107, 157, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#ffd6e7';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '10px',
                    fontWeight: 'bold',
                    color: '#ff6b9d'
                  }}>
                    🏷️ 标签（多个用逗号分隔，中英文逗号均可）
                  </label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: '16px',
                      border: '2px solid #ffd6e7',
                      fontSize: '16px',
                      boxSizing: 'border-box',
                      background: '#fff8fb',
                      outline: 'none',
                      transition: 'all 0.3s ease'
                    }}
                    placeholder="如：古风，对唱，三拍子，原耽"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#ff6b9d';
                      e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 157, 0.15)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ffd6e7';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '10px',
                    fontWeight: 'bold',
                    color: '#ff6b9d'
                  }}>
                    🎹 升降调
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      onClick={() => key === null && setKey(0)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 16px',
                        background: '#fff5f8',
                        borderRadius: '16px',
                        border: '2px solid #ffd6e7',
                        width: 'fit-content',
                        cursor: key === null ? 'pointer' : 'default',
                        opacity: key === null ? 0.5 : 1,
                        transition: 'opacity 0.2s ease'
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setKey(k => k === null ? 0 : k - 1); }}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          border: '2px solid #ff6b9d',
                          background: '#fff5f8',
                          color: '#ff6b9d',
                          cursor: 'pointer',
                          fontSize: '20px',
                          fontWeight: 'bold',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (key !== null) {
                            e.currentTarget.style.background = '#ffe8f0';
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (key !== null) {
                            e.currentTarget.style.background = '#fff5f8';
                            e.currentTarget.style.transform = 'scale(1)';
                          }
                        }}
                      >
                        −
                      </button>
                      <span style={{
                        fontSize: '18px',
                        fontWeight: 'bold',
                        minWidth: '55px',
                        textAlign: 'center',
                        color: '#ff6b9d'
                      }}>
                        {formatKey(key)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setKey(k => k === null ? 0 : k + 1); }}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          border: '2px solid #ff6b9d',
                          background: '#fff5f8',
                          color: '#ff6b9d',
                          cursor: 'pointer',
                          fontSize: '20px',
                          fontWeight: 'bold',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (key !== null) {
                            e.currentTarget.style.background = '#ffe8f0';
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (key !== null) {
                            e.currentTarget.style.background = '#fff5f8';
                            e.currentTarget.style.transform = 'scale(1)';
                          }
                        }}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setKey(null)}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '12px',
                        border: key === null ? '2px solid #9e9e9e' : '2px solid #e0e0e0',
                        background: key === null ? '#f5f5f5' : '#fff',
                        color: key === null ? '#757575' : '#bdbdbd',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (key !== null) {
                          e.currentTarget.style.background = '#f5f5f5';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (key !== null) {
                          e.currentTarget.style.background = '#fff';
                        }
                      }}
                    >
                      未定调
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '10px',
                    fontWeight: 'bold',
                    color: '#ff6b9d'
                  }}>
                    👥 合唱类型
                  </label>
                  <EnsembleTypeControl
                    value={ensembleType}
                    onChange={setEnsembleType}
                  />
                </div>

                {/* 第三行：notes（最大化） | featured（紧凑） */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontWeight: 'bold',
                      color: '#ff6b9d',
                      fontSize: '13px'
                    }}>
                      📝 备注
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '2px solid #ffcce0',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                        background: '#fff5f8',
                        outline: 'none',
                        transition: 'all 0.3s ease'
                      }}
                      placeholder="可以写点什么... (可选)"
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#ff6b9d';
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 107, 157, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#ffcce0';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                  <div style={{ flex: 'none', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 'bold',
                      color: '#8b0000',
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: featured ? '#ffe4e1' : '#fff5f8',
                      borderRadius: '10px',
                      border: featured ? '2px solid #8b0000' : '2px solid #ffd6e7',
                      transition: 'all 0.3s ease',
                      fontSize: '13px',
                      whiteSpace: 'nowrap'
                    }}>
                      <input
                        type="checkbox"
                        checked={featured}
                        onChange={(e) => setFeatured(e.target.checked)}
                        style={{
                          width: '16px',
                          height: '16px',
                          cursor: 'pointer',
                          accentColor: '#8b0000'
                        }}
                      />
                      <span>⭐ featured</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setPinned(!pinned)}
                      title={pinned ? '取消置顶 (Unpin)' : '置顶 (Pin)'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 'bold',
                        color: pinned ? '#ffffff' : '#d95d39',
                        cursor: 'pointer',
                        padding: '10px 12px',
                        background: pinned ? '#d95d39' : '#fff3ed',
                        borderRadius: '10px',
                        border: pinned ? '2px solid #d95d39' : '2px solid #ffd0be',
                        transition: 'all 0.2s ease',
                        fontSize: '13px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {pinned ? <PinOffIcon size={16} /> : <PinIcon size={16} />}
                      <span>{pinned ? 'unpin' : 'pin'}</span>
                    </button>
                  </div>
                </div>

                {/* 第四行：save 按钮 */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: loading ? '#ffd6e7' : '#ff6b9d',
                    color: 'white',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '10px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    boxShadow: loading ? 'none' : '0 4px 12px rgba(255, 107, 157, 0.3)',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 107, 157, 0.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 107, 157, 0.3)';
                    }
                  }}
                >
                  {loading ? '保存中... 💾' : '保存 '}
                </button>
              </form>
            )}

            {/* 歌曲列表 */}
            <div className="song-grid">
              {!isLoadingSongs && filteredSongs.length > 0 && [0, 1, 2].map((columnIndex) => (
                <div key={columnIndex} className="song-column">
                  {filteredSongs
                    .filter((_, index) => index % 3 === columnIndex)
                    .map((song) => (
                      <div
                  key={song.id}
                  onClick={() => {
                    setSelectedSong(song);
                    setIsEditing(false);
                    setIsRandomPick(false);
                  }}
                  style={{
                    background: selectedSong?.id === song.id ? '#fff5f8' : '#ffffff',
                    padding: getEnsembleIcon(song.ensembleType) ? '12px 38px 12px 12px' : '12px',
                    borderRadius: '12px',
                    boxShadow: selectedSong?.id === song.id
                      ? '0 2px 10px rgba(255, 107, 157, 0.2)'
                      : '0 1px 4px rgba(255, 107, 157, 0.06)',
                    cursor: 'pointer',
                    border: selectedSong?.id === song.id ? '2px solid #ff6b9d' : '2px solid #ffe8f0',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                    minWidth: 0
                  }}
                  onMouseEnter={(e) => {
                    if (selectedSong?.id !== song.id) {
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 107, 157, 0.12)';
                      e.currentTarget.style.border = '2px solid #ffd6e7';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedSong?.id !== song.id) {
                      e.currentTarget.style.boxShadow = '0 1px 4px rgba(255, 107, 157, 0.06)';
                      e.currentTarget.style.border = '2px solid #ffe8f0';
                    }
                  }}
                >
                  {/* 置顶图钉 - 左上角斜插，一半在卡片内一半在卡片外 */}
                  {song.pinned && <PinnedCornerPin size={22} offset={-10} />}
                  {/* 音频标识 - 位于右上角，featured 左侧 */}
                  {song.hasAudio && (
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      right: song.featured ? '34px' : '8px',
                      padding: '2px 6px',
                      backgroundColor: '#fce4ec',
                      color: '#ff6b9d',
                      borderRadius: '8px',
                      fontSize: '10px',
                      fontWeight: 'bold'
                    }}>
                      🎧
                    </div>
                  )}
                  {/* 主打歌标识 - 仅主打歌显示 */}
                  {song.featured && (
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      padding: '2px 6px',
                      backgroundColor: '#8b0000',
                      color: 'white',
                      borderRadius: '8px',
                      fontSize: '10px',
                      fontWeight: 'bold'
                    }}>
                      ⭐
                    </div>
                  )}
                  {getEnsembleIcon(song.ensembleType) && (
                    <div style={{
                      position: 'absolute',
                      right: '8px',
                      bottom: '8px',
                      fontSize: '20px',
                      lineHeight: 1,
                      background: '#ffd7a8',
                      borderRadius: '10px',
                      padding: '2px'
                    }}>
                      {getEnsembleIcon(song.ensembleType)}
                    </div>
                  )}

                  <div style={{
                    fontWeight: 'bold',
                    fontSize: '14px',
                    marginBottom: '6px',
                    color: '#333',
                    paddingRight: song.featured && song.hasAudio ? '62px' : (song.featured || song.hasAudio ? '34px' : '0'),
                    lineHeight: '1.3'
                  }}>
                    {song.name}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    {song.singers.map((singer, i) => (
                      <span
                        key={i}
                        style={{
                          background: '#f5f3ff',
                          color: '#8b7bf7',
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: '600',
                          border: '1px solid #ddd6fe'
                        }}
                      >
                        {singer}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <span style={{
                      background: song.key === null ? '#f5f5f5' : '#f0f9ff',
                      color: song.key === null ? '#9e9e9e' : '#6bb3c7',
                      padding: '3px 8px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      border: song.key === null ? '1px solid #9e9e9e' : '1px solid #6bb3c7'
                    }}>
                      {formatKey(song.key)}
                    </span>
                    {song.tags.slice(0, 2).map((tag, i) => (
                      <span
                        key={i}
                        style={{
                          background: '#e8f5e9',
                          color: '#2e7d32',
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                    {song.tags.length > 2 && (
                      <span style={{
                        background: '#f5f5f5',
                        color: '#888',
                        padding: '3px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}>
                        +{song.tags.length - 2}
                      </span>
                    )}
                  </div>
                      </div>
                    ))}
                </div>
              ))}
              {isLoadingSongs ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  background: '#fff5f8',
                  borderRadius: '16px',
                  border: '2px dashed #ffd6e7',
                  gridColumn: '1 / -1'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    border: '3px solid #ffe8f0',
                    borderTop: '3px solid #ff6b9d',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 16px'
                  }} />
                  <style>{`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
                  <p style={{ color: '#ff8fab', fontSize: '14px' }}>正在加载歌曲...</p>
                </div>
              ) : filteredSongs.length === 0 && (
                <div style={{
                  padding: '40px 20px',
                  background: '#fff5f8',
                  borderRadius: '16px',
                  textAlign: 'center',
                  border: '2px dashed #ffd6e7',
                  gridColumn: '1 / -1'
                }}>
                  <p style={{
                    color: '#ff6b9d',
                    fontSize: '14px',
                    fontWeight: '500',
                    margin: 0
                  }}>
                    {songs.length === 0 ? '还没有歌曲，添加一首吧！' : '🔍 没有匹配的歌曲'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="right-panel">
            {selectedSong ? (
              isEditing ? (
                // 编辑模式
                <form
                  onSubmit={saveEdit}
                  style={{
                    background: '#fff0f1',
                    padding: '20px',
                    borderRadius: '20px',
                    boxShadow: '0 2px 16px rgba(255, 107, 157, 0.12)',
                    border: '2px solid #ffd6e7'
                  }}
                >
                  <h2 style={{
                    fontSize: '20px',
                    marginBottom: '20px',
                    color: '#ff6b9d',
                    fontWeight: 'bold'
                  }}>编辑歌曲</h2>

                  <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                  <div style={{ marginBottom: '20px', flex: 1 }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '10px',
                      fontWeight: 'bold',
                      color: '#ff6b9d'
                    }}>
                      🎵 歌曲名称 *
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '14px 18px',
                        borderRadius: '16px',
                        border: '2px solid #ffd6e7',
                        fontSize: '16px',
                        boxSizing: 'border-box',
                        background: '#fff8fb',
                        outline: 'none',
                        transition: 'all 0.3s ease'
                      }}
                      required
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#ff6b9d';
                        e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 157, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#ffd6e7';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '20px', flex: 1 }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '10px',
                      fontWeight: 'bold',
                      color: '#ff6b9d'
                    }}>
                      🎤 参考歌手 *（多个用逗号分隔，中英文逗号均可）
                    </label>
                    <input
                      type="text"
                      value={editSingersInput}
                      onChange={(e) => setEditSingersInput(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '14px 18px',
                        borderRadius: '16px',
                        border: '2px solid #ffd6e7',
                        fontSize: '16px',
                        boxSizing: 'border-box',
                        background: '#fff8fb',
                        outline: 'none',
                        transition: 'all 0.3s ease'
                      }}
                      required
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#ff6b9d';
                        e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 157, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#ffd6e7';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '10px',
                      fontWeight: 'bold',
                      color: '#ff6b9d'
                    }}>
                      🏷️ 标签（多个用逗号分隔，中英文逗号均可）
                    </label>
                    <input
                      type="text"
                      value={editTagsInput}
                      onChange={(e) => setEditTagsInput(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '14px 18px',
                        borderRadius: '16px',
                        border: '2px solid #ffd6e7',
                        fontSize: '16px',
                        boxSizing: 'border-box',
                        background: '#fff8fb',
                        outline: 'none',
                        transition: 'all 0.3s ease'
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#ff6b9d';
                        e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 157, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#ffd6e7';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '12px',
                      fontWeight: 'bold',
                      color: '#ff6b9d'
                    }}>
                      🎹 升降调
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        onClick={() => editKey === null && setEditKey(0)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 14px',
                          background: '#fff5f8',
                          borderRadius: '14px',
                          border: '2px solid #ffd6e7',
                          width: 'fit-content',
                          cursor: editKey === null ? 'pointer' : 'default',
                          opacity: editKey === null ? 0.5 : 1,
                          transition: 'opacity 0.2s ease'
                        }}
                      >
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditKey(k => k === null ? 0 : k - 1); }}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            border: '2px solid #ff6b9d',
                            background: '#fff5f8',
                            color: '#ff6b9d',
                            cursor: 'pointer',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (editKey !== null) {
                              e.currentTarget.style.background = '#ffe8f0';
                              e.currentTarget.style.transform = 'scale(1.05)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (editKey !== null) {
                              e.currentTarget.style.background = '#fff5f8';
                              e.currentTarget.style.transform = 'scale(1)';
                            }
                          }}
                        >
                          −
                        </button>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: 'bold',
                          minWidth: '50px',
                          textAlign: 'center',
                          color: '#ff6b9d'
                        }}>
                          {formatKey(editKey)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditKey(k => k === null ? 0 : k + 1); }}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            border: '2px solid #ff6b9d',
                            background: '#fff5f8',
                            color: '#ff6b9d',
                            cursor: 'pointer',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (editKey !== null) {
                              e.currentTarget.style.background = '#ffe8f0';
                              e.currentTarget.style.transform = 'scale(1.05)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (editKey !== null) {
                              e.currentTarget.style.background = '#fff5f8';
                              e.currentTarget.style.transform = 'scale(1)';
                            }
                          }}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditKey(null)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '10px',
                          border: editKey === null ? '2px solid #9e9e9e' : '2px solid #e0e0e0',
                          background: editKey === null ? '#f5f5f5' : '#fff',
                          color: editKey === null ? '#757575' : '#bdbdbd',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (editKey !== null) {
                            e.currentTarget.style.background = '#f5f5f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (editKey !== null) {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        未定调
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '10px',
                      fontWeight: 'bold',
                      color: '#ff6b9d'
                    }}>
                      📋 信息
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', alignItems: 'center' }}>
                      <EnsembleTypeControl
                        value={editEnsembleType}
                        onChange={setEditEnsembleType}
                        grouped
                      />
                      <div
                        data-testid="edit-flags-group"
                        style={{ display: 'flex', gap: '6px', alignItems: 'center', width: '100%', minWidth: 0 }}
                      >
                        <button
                          type="button"
                          data-testid="edit-featured-button"
                          onClick={() => setEditFeatured(!editFeatured)}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            fontWeight: 'bold',
                            color: editFeatured ? '#ffffff' : '#8b0000',
                            cursor: 'pointer',
                            height: '40px',
                            padding: '0 6px',
                            boxSizing: 'border-box',
                            background: editFeatured ? '#8b0000' : '#ffe4e1',
                            borderRadius: '14px',
                            border: editFeatured ? '2px solid #8b0000' : '2px solid #ffc0cb',
                            transition: 'all 0.2s ease',
                            fontSize: '13px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <span>{editFeatured ? '⭐ featured' : '☆ featured'}</span>
                        </button>
                        <button
                          type="button"
                          data-testid="edit-pin-button"
                          onClick={() => setEditPinned(!editPinned)}
                          title={editPinned ? '取消置顶 (Unpin)' : '置顶 (Pin)'}
                          aria-label={editPinned ? '取消置顶' : '置顶'}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            fontWeight: 'bold',
                            color: editPinned ? '#ffffff' : '#d95d39',
                            cursor: 'pointer',
                            height: '40px',
                            padding: '0 6px',
                            boxSizing: 'border-box',
                            background: editPinned ? '#d95d39' : '#fff3ed',
                            borderRadius: '14px',
                            border: editPinned ? '2px solid #d95d39' : '2px solid #ffd0be',
                            fontSize: '13px',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {editPinned ? <PinOffIcon size={15} /> : <PinIcon size={15} />}
                          <span>{editPinned ? 'unpin' : 'pin'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', color: '#ff6b9d' }}>
                      📝 备注
                    </label>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '14px',
                        border: '2px solid #ffcce0',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                        minHeight: '60px',
                        background: '#fff5f8',
                        outline: 'none',
                        transition: 'all 0.3s ease'
                      }}
                      placeholder="可以写点什么... ✨ (可选)"
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#ff6b9d';
                        e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 157, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#ffcce0';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '10px',
                      fontWeight: 'bold',
                      color: '#ff6b9d'
                    }}>
                      🎧 歌曲音频（MP3，≤{MAX_AUDIO_DURATION_SECONDS} 秒）
                    </label>

                    {selectedSong?.hasAudio && !editAudioRemoved && !editAudioFile && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '10px 14px',
                        marginBottom: '10px',
                        background: '#fff5f8',
                        borderRadius: '14px',
                        border: '2px solid #ffd6e7'
                      }}>
                        <span style={{ fontSize: '13px', color: '#ff6b9d', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          🎵 {selectedSong.audioMeta?.fileName ?? '已上传音频'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditAudioRemoved(true)}
                          style={{
                            flexShrink: 0,
                            padding: '6px 12px',
                            borderRadius: '10px',
                            border: '2px solid #f44336',
                            background: '#fff',
                            color: '#f44336',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 'bold'
                          }}
                        >
                          移除
                        </button>
                      </div>
                    )}

                    {editAudioRemoved && !editAudioFile && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '10px 14px',
                        marginBottom: '10px',
                        background: '#fff0f0',
                        borderRadius: '14px',
                        border: '2px dashed #f44336'
                      }}>
                        <span style={{ fontSize: '13px', color: '#f44336', fontWeight: 'bold' }}>
                          已标记移除，保存后生效
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditAudioRemoved(false)}
                          style={{
                            flexShrink: 0,
                            padding: '6px 12px',
                            borderRadius: '10px',
                            border: '2px solid #ffd6e7',
                            background: '#fff',
                            color: '#ff6b9d',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 'bold'
                          }}
                        >
                          撤销
                        </button>
                      </div>
                    )}

                    <label
                      onDragOver={(e) => { e.preventDefault(); setEditAudioDragging(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setEditAudioDragging(false); }}
                      onDrop={handleEditAudioDrop}
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '16px',
                        border: `2px dashed ${editAudioDragging ? '#ff6b9d' : '#ffd6e7'}`,
                        background: editAudioDragging ? '#ffe8f0' : '#fff8fb',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        textAlign: 'center',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <input
                        type="file"
                        accept="audio/mpeg,.mp3"
                        onChange={handleEditAudioChange}
                        style={{ display: 'none' }}
                      />
                      <span style={{ fontSize: '18px', lineHeight: 1, flexShrink: 0 }}>{editAudioFile ? '🎵' : '🎧'}</span>
                      {editAudioFile ? (
                        <span style={{ fontSize: '13px', color: '#ff6b9d', fontWeight: 'bold', wordBreak: 'break-all' }}>
                          {editAudioFile.name}
                          {editAudioDuration !== null && `（${Math.round(editAudioDuration)} 秒）`}
                        </span>
                      ) : (
                        <>
                          <span style={{ fontSize: '13px', color: '#ff6b9d', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                            点击选择或拖拽 MP3 到此处
                          </span>
                          <span style={{ fontSize: '12px', color: '#ff8fab', whiteSpace: 'nowrap' }}>
                            仅支持 MP3，时长 ≤ {MAX_AUDIO_DURATION_SECONDS} 秒
                          </span>
                        </>
                      )}
                    </label>

                    {editAudioError && (
                      <div style={{ marginTop: '10px', fontSize: '13px', color: '#ff4757', fontWeight: 'bold' }}>
                        {editAudioError}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="submit"
                      disabled={loading}
                      style={{
                        flex: 1,
                        background: loading ? '#ffd6e7' : '#ff6b9d',
                        color: 'white',
                        border: 'none',
                        padding: '12px 20px',
                        borderRadius: '18px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '15px',
                        fontWeight: 'bold',
                        boxShadow: loading ? 'none' : '0 4px 12px rgba(255, 107, 157, 0.3)',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 107, 157, 0.4)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = loading ? 'none' : '0 4px 12px rgba(255, 107, 157, 0.3)';
                      }}
                    >
                      {loading ? '保存中... 💾' : '保存 '}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      style={{
                        flex: 1,
                        background: '#fff5f8',
                        color: '#ff6b9d',
                        border: '2px solid #ffd6e7',
                        padding: '12px 20px',
                        borderRadius: '18px',
                        cursor: 'pointer',
                        fontSize: '15px',
                        fontWeight: 'bold',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#ffe8f0';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#fff5f8';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                // 查看模式
                <div style={{
                  background: isRandomPick ? '#fffef5' : '#fff0f1',
                  padding: '20px',
                  borderRadius: '20px',
                  boxShadow: isRandomPick
                    ? '0 2px 20px rgba(218, 165, 32, 0.18)'
                    : '0 2px 16px rgba(255, 107, 157, 0.12)',
                  border: isRandomPick ? '2px solidrgb(194, 146, 26)' : '2px solid #ffd6e7',
                  position: 'relative'
                }}>
                  {selectedSong.pinned && <PinnedCornerPin size={26} offset={-12} />}
                  {isRandomPick && (
                    <div style={{
                      position: 'absolute',
                      top: '-16px',
                      right: '-16px',
                      width: '44px',
                      height: '44px',
                      background: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                      boxShadow: '0 3px 12px rgba(218, 165, 32, 0.35)',
                      border: '2px solid #daa520'
                    }}>
                      🎲
                    </div>
                  )}
                  <div className="song-detail-header">
                    <h2 className="song-detail-title">{selectedSong.name}</h2>
                    <div className="song-detail-actions">
                      {/* 主打歌标识 */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: selectedSong.featured ? '4px 10px' : '4px 8px',
                        backgroundColor: selectedSong.featured ? '#8b0000' : '#f0d0d0',
                        color: selectedSong.featured ? 'white' : '#b87070',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        <span>{selectedSong.featured ? '⭐' : '☆'}</span>
                        {selectedSong.featured && <span>featured</span>}
                      </div>
                      {/* 合唱类型标识 */}
                      {normalizeEnsembleType(selectedSong.ensembleType) !== 'none' && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '4px 10px',
                          backgroundColor: '#fda085',
                          color: 'white',
                          borderRadius: '10px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          {normalizeEnsembleType(selectedSong.ensembleType) === 'chorus' ? '合唱' : '对唱'}
                        </div>
                      )}
                      {/* 歌词按钮 */}
                      <button
                        onClick={openLyricsModal}
                        title={selectedSong.lyrics ? '查看/编辑歌词' : '添加歌词'}
                        style={{
                          marginLeft: 'auto',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 12px',
                          borderRadius: '12px',
                          border: selectedSong.lyrics ? '2px solid #ff6b9d' : '2px solid #e6d3dc',
                          background: selectedSong.lyrics ? '#fff0f5' : '#f7f0f3',
                          color: selectedSong.lyrics ? '#ff6b9d' : '#c98fa3',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.3s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = selectedSong.lyrics ? '#ffe8f0' : '#f0e3e9';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = selectedSong.lyrics ? '#fff0f5' : '#f7f0f3';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        🎶 {selectedSong.lyrics ? '歌词' : '无歌词'}
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      color: '#ff8fab',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      marginBottom: '8px'
                    }}>🎤 参考歌手</label>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {selectedSong.singers.map((singer, i) => (
                        <span
                          key={i}
                          style={{
                            background: '#f5f3ff',
                            color: '#8b7bf7',
                            padding: '6px 12px',
                            borderRadius: '12px',
                            fontSize: '13px',
                            fontWeight: '600',
                            border: '1px solid #ddd6fe'
                          }}
                        >
                          {singer}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      color: '#ff8fab',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      marginBottom: '8px'
                    }}>🎹 升降调</label>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: 'bold',
                      color: selectedSong.key === null ? '#9e9e9e' : '#6bb3c7',
                      background: selectedSong.key === null ? '#f5f5f5' : '#f0f9ff',
                      padding: '8px 14px',
                      borderRadius: '14px',
                      border: selectedSong.key === null ? '2px solid #9e9e9e' : '2px solid #6bb3c7',
                      display: 'inline-block'
                    }}>
                      {formatKey(selectedSong.key)}
                    </div>
                  </div>

                  {selectedSong.tags.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{
                        display: 'block',
                        color: '#ff8fab',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        marginBottom: '8px'
                      }}>🏷️ 标签</label>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {selectedSong.tags.map((tag, i) => (
                          <span
                            key={i}
                            style={{
                              background: '#e8f5e9',
                              color: '#2e7d32',
                              padding: '6px 12px',
                              borderRadius: '12px',
                              fontSize: '13px',
                              fontWeight: '500'
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedSong.notes && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ color: '#ff6b9d', fontSize: '13px', fontWeight: 'bold' }}>📝 备注</label>
                      <div style={{
                        marginTop: '8px',
                        padding: '12px 16px',
                        background: '#fff5f8',
                        borderRadius: '14px',
                        border: '2px solid #ffd6e7',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.3s ease'
                      }}>
                        <span style={{
                          fontSize: '14px',
                          color: '#ff6b9d',
                          lineHeight: '1.5'
                        }}>
                          {selectedSong.notes}
                        </span>
                      </div>
                    </div>
                  )}

                  {selectedSong.hasAudio && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{
                        display: 'block',
                        color: '#ff8fab',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        marginBottom: '8px'
                      }}>🎧 试听</label>
                      {audioLoading ? (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '13px',
                          color: '#ff8fab',
                          fontWeight: '500'
                        }}>
                          <span style={{
                            width: '14px',
                            height: '14px',
                            border: '2px solid #ffe8f0',
                            borderTop: '2px solid #ff6b9d',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                            flexShrink: 0
                          }} />
                          <span>加载中...</span>
                        </div>
                      ) : audioSrc ? (
                        <audio controls src={audioSrc} style={{ width: '100%' }} />
                      ) : (
                        <div style={{ fontSize: '13px', color: '#adb5bd', fontWeight: '500' }}>音频加载失败</div>
                      )}
                    </div>
                  )}

                  <div style={{
                    color: '#ff8fab',
                    fontSize: '12px',
                    marginBottom: '16px',
                    padding: '10px 12px',
                    background: '#fff0f5',
                    borderRadius: '10px',
                    border: '1px dashed #ffd6e7'
                  }}>
                    🕐 添加时间: {new Date(selectedSong.createdAt).toLocaleString('zh-CN')}
                  </div>

                  {isAdmin ? (
                    <div className="detail-bottom-actions" style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        className="detail-icon-btn"
                        data-testid="detail-pin-button"
                        disabled={pinningSongId === selectedSong.id}
                        onClick={() => togglePinSong(selectedSong)}
                        title={selectedSong.pinned ? '取消置顶 (Unpin)' : '置顶 (Pin)'}
                        aria-label={selectedSong.pinned ? '取消置顶' : '置顶'}
                        style={{
                          width: '44px',
                          height: '44px',
                          background: selectedSong.pinned ? '#d95d39' : '#fff3ed',
                          color: selectedSong.pinned ? '#ffffff' : '#d95d39',
                          border: selectedSong.pinned ? '2px solid #d95d39' : '2px solid #ffd0be',
                          borderRadius: '12px',
                          cursor: pinningSongId === selectedSong.id ? 'wait' : 'pointer',
                          opacity: pinningSongId === selectedSong.id ? 0.65 : 1,
                          boxShadow: selectedSong.pinned
                            ? '0 4px 12px rgba(217, 93, 57, 0.3)'
                            : '0 2px 8px rgba(217, 93, 57, 0.12)',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => {
                          if (pinningSongId !== selectedSong.id) {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        {selectedSong.pinned ? <PinOffIcon size={20} /> : <PinIcon size={20} />}
                      </button>
                      <button
                        className="detail-edit-btn"
                        onClick={startEdit}
                        style={{
                          flex: 1,
                          background: '#2196F3',
                          color: 'white',
                          border: 'none',
                          padding: '12px 20px',
                          borderRadius: '16px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
                          transition: 'all 0.3s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.3)';
                        }}
                      >
                        编辑 ✏️
                      </button>
                      <button
                        className="detail-icon-btn"
                        onClick={() => removeSong(selectedSong.id)}
                        style={{
                          width: '44px',
                          height: '44px',
                          background: '#f44336',
                          color: 'white',
                          border: 'none',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '16px',
                          fontWeight: 'bold',
                          boxShadow: '0 4px 12px rgba(244, 67, 54, 0.3)',
                          transition: 'all 0.3s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 6px 16px rgba(244, 67, 54, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(244, 67, 54, 0.3)';
                        }}
                        title="删除"
                      >
                        🗑️
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      padding: '14px',
                      background: '#fff5f8',
                      borderRadius: '14px',
                      textAlign: 'center',
                      color: '#ff6b9d',
                      fontSize: '14px',
                      border: '2px dashed #ffd6e7',
                      fontWeight: '500'
                    }}>
                      🔒 只读模式（点击右上角编辑模式登录后可编辑）
                    </div>
                  )}
                </div>
              )
            ) : (
              <div style={{
                background: '#fff0f1',
                padding: '40px 30px',
                borderRadius: '20px',
                textAlign: 'center',
                color: '#ff8fab',
                border: '2px dashed #ffd6e7',
                boxShadow: '0 2px 12px rgba(255, 107, 157, 0.06)'
              }}>
                <div style={{
                  fontSize: '40px',
                  marginBottom: '12px',
                  opacity: 0.8
                }}>🎵</div>
                <p style={{
                  fontSize: '14px',
                  margin: 0,
                  fontWeight: '500'
                }}>点击左侧歌曲查看详情 ✨</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
