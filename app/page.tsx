'use client';

import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { Song, CreateSongRequest } from '@/types/song';
import { matchesPinyin, matchesPinyinArray, preloadPinyinCache } from '@/lib/pinyin-search';

// 从环境变量读取密码，默认为 'daisy2024'
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_SONGLIST_PASSWORD?.trim() || 'daisy2024';
const ADMIN_KEY = 'isAdmin';

/**
 * 对歌曲列表进行排序
 * 排序优先级：歌手名 > 歌曲名 > key绝对值
 */
function sortSongs(songs: Song[]): Song[] {
  return [...songs].sort((a, b) => {
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

  // 搜索框状态
  const [searchName, setSearchName] = useState('');
  const [searchSinger, setSearchSinger] = useState('');
  const [searchTag, setSearchTag] = useState('');

  // 拼音搜索：使用 useDeferredValue 保持输入框即时响应
  const deferredName   = useDeferredValue(searchName);
  const deferredSinger = useDeferredValue(searchSinger);
  const deferredTag    = useDeferredValue(searchTag);

  // 主打歌筛选状态
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isRandomPick, setIsRandomPick] = useState(false);

  // 编辑表单状态
  const [editName, setEditName] = useState('');
  const [editSingersInput, setEditSingersInput] = useState('');
  const [editTagsInput, setEditTagsInput] = useState('');
  const [editKey, setEditKey] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editFeatured, setEditFeatured] = useState(false);

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

  // 数据加载后预热拼音缓存，确保首次搜索时无延迟
  useEffect(() => {
    if (!songs.length) return;
    const texts = new Set<string>();
    songs.forEach(s => {
      texts.add(s.name);
      s.singers.forEach(x => texts.add(x));
      s.tags.forEach(x => texts.add(x));
    });
    queueMicrotask(() => preloadPinyinCache(Array.from(texts)));
  }, [songs]);

  // 过滤并排序歌曲（支持拼音搜索）
  const filteredSongs = useMemo(() => {
    const filtered = songs.filter(song => {
      // 主打歌筛选
      if (showFeaturedOnly && !song.featured) {
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

    // 应用排序
    return sortSongs(filtered);
  }, [songs, deferredName, deferredSinger, deferredTag, showFeaturedOnly]);

  // 清除所有搜索
  const clearAllFilters = () => {
    setSearchName('');
    setSearchSinger('');
    setSearchTag('');
    setShowFeaturedOnly(false);
  };

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
        featured
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
    setIsEditing(true);
  };

  // 取消编辑
  const cancelEdit = () => {
    setIsEditing(false);
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
          featured: editFeatured
        })
      });

      const data = await response.json();
      if (data.success) {
        setIsEditing(false);
        setSelectedSong(data.data);
        fetchSongs(true);
      } else {
        alert(data.error || '更新失败');
      }
    } catch (error) {
      console.error('更新歌曲失败:', error);
      alert('更新失败');
    } finally {
      setLoading(false);
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

  // 搜索框样式 - 浅粉色主题
  const searchInputStyle = {
    padding: '12px 16px',
    borderRadius: '20px',
    border: '2px solid #ffd6e7',
    fontSize: '14px',
    flex: 1,
    minWidth: '150px',
    background: '#fff8fb',
    outline: 'none',
    transition: 'all 0.3s ease'
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#fff5f8'
    }}>
      <main style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '16px',
        minHeight: '100vh'
      }}>
        <style>{`
          .song-grid { column-count: 3; column-gap: 10px; }
          .main-layout { display: flex; gap: 16px; align-items: flex-start; }
          .left-panel { width: 64%; }
          .right-panel { width: 36%; position: sticky; top: 16px; }
          @media (max-width: 768px) {
            .song-grid { column-count: 1; }
            .left-panel { width: 50%; }
            .right-panel { width: 50%; }
          }
        `}</style>
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

        {/* 搜索区域 */}
        <div style={{
          background: '#ffffff',
          padding: '16px',
          borderRadius: '16px',
          marginBottom: '16px',
          boxShadow: '0 2px 12px rgba(255, 107, 157, 0.08)',
          border: '2px solid #ffd6e7'
        }}>
          <div style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: '12px'
          }}>
            <input
              type="text"
              placeholder="🔍 搜索歌名（支持拼音）..."
              value={searchName}
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
              type="text"
              placeholder="🎤 搜索歌手（支持拼音）..."
              value={searchSinger}
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
              type="text"
              placeholder="🏷️ 搜索标签（支持拼音）..."
              value={searchTag}
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
            <button
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
              onClick={clearAllFilters}
              style={{
                background: '#fff5f8',
                color: '#ff6b9d',
                border: '2px solid #ffd6e7',
                padding: '10px 20px',
                borderRadius: '16px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
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
              清除搜索
            </button>
          </div>
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

        <div className="main-layout">
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
                  <div style={{ flex: 'none' }}>
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
              {filteredSongs.map((song) => (
                <div
                  key={song.id}
                  onClick={() => {
                    setSelectedSong(song);
                    setIsEditing(false);
                    setIsRandomPick(false);
                  }}
                  style={{
                    background: selectedSong?.id === song.id ? '#fff5f8' : '#ffffff',
                    padding: '12px',
                    borderRadius: '12px',
                    boxShadow: selectedSong?.id === song.id
                      ? '0 2px 10px rgba(255, 107, 157, 0.2)'
                      : '0 1px 4px rgba(255, 107, 157, 0.06)',
                    cursor: 'pointer',
                    border: selectedSong?.id === song.id ? '2px solid #ff6b9d' : '2px solid #ffe8f0',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                    breakInside: 'avoid',
                    marginBottom: '10px'
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

                  <div style={{
                    fontWeight: 'bold',
                    fontSize: '14px',
                    marginBottom: '6px',
                    color: '#333',
                    paddingRight: song.featured ? '34px' : '0',
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
              {isLoadingSongs ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  background: '#fff5f8',
                  borderRadius: '16px',
                  border: '2px dashed #ffd6e7',
                  columnSpan: 'all'
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
                  columnSpan: 'all'
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
                    background: '#ffffff',
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

                  <div style={{ marginBottom: '20px' }}>
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

                  <div style={{ marginBottom: '20px' }}>
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

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: 'bold',
                      color: '#8b0000',
                      cursor: 'pointer',
                      padding: '10px 14px',
                      background: editFeatured ? '#ffe4e1' : '#fff5f8',
                      borderRadius: '14px',
                      border: editFeatured ? '2px solid #8b0000' : '2px solid #ffd6e7',
                      transition: 'all 0.3s ease'
                    }}>
                      <input
                        type="checkbox"
                        checked={editFeatured}
                        onChange={(e) => setEditFeatured(e.target.checked)}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer',
                          accentColor: '#8b0000'
                        }}
                      />
                      <span>⭐ featured</span>
                    </label>
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
                  background: isRandomPick ? '#fffef5' : '#ffffff',
                  padding: '20px',
                  borderRadius: '20px',
                  boxShadow: isRandomPick
                    ? '0 2px 20px rgba(218, 165, 32, 0.18)'
                    : '0 2px 16px rgba(255, 107, 157, 0.12)',
                  border: isRandomPick ? '2px solidrgb(194, 146, 26)' : '2px solid #ffd6e7',
                  position: 'relative'
                }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <h2 style={{
                      fontSize: '20px',
                      color: '#ff6b9d',
                      fontWeight: 'bold',
                      margin: 0
                    }}>{selectedSong.name}</h2>
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

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ color: '#ff6b9d', fontSize: '13px', fontWeight: 'bold' }}>📝 备注</label>
                    <div style={{
                      marginTop: '8px',
                      padding: '12px 16px',
                      background: selectedSong.notes ? '#fff5f8' : '#f8f9fa',
                      borderRadius: '14px',
                      border: '2px solid ' + (selectedSong.notes ? '#ffd6e7' : '#e9ecef'),
                      minHeight: selectedSong.notes ? 'auto' : '50px',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.3s ease'
                    }}>
                      <span style={{
                        fontSize: '14px',
                        color: selectedSong.notes ? '#ff6b9d' : '#adb5bd',
                        lineHeight: '1.5'
                      }}>
                        {selectedSong.notes ? selectedSong.notes : '无备注~'}
                      </span>
                    </div>
                  </div>

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
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
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
                background: '#fff5f8',
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
