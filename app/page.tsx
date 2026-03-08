'use client';

import { useState, useEffect, useMemo } from 'react';
import { Song, CreateSongRequest } from '@/types/song';

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

  // 主打歌筛选状态
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isEditing, setIsEditing] = useState(false);

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

  // 过滤并排序歌曲
  const filteredSongs = useMemo(() => {
    const filtered = songs.filter(song => {
      // 主打歌筛选
      if (showFeaturedOnly && !song.featured) {
        return false;
      }

      // 歌名搜索
      if (searchName.trim()) {
        const searchLower = searchName.trim().toLowerCase();
        if (!song.name.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      // 歌手搜索
      if (searchSinger.trim()) {
        const searchLower = searchSinger.trim().toLowerCase();
        const hasMatch = song.singers.some(singer =>
          singer.toLowerCase().includes(searchLower)
        );
        if (!hasMatch) return false;
      }

      // Tag 搜索
      if (searchTag.trim()) {
        const searchLower = searchTag.trim().toLowerCase();
        const hasMatch = song.tags.some(tag =>
          tag.toLowerCase().includes(searchLower)
        );
        if (!hasMatch) return false;
      }

      return true;
    });

    // 应用排序
    return sortSongs(filtered);
  }, [songs, searchName, searchSinger, searchTag, showFeaturedOnly]);

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
      background: 'linear-gradient(135deg, #fff0f5 0%, #ffe4ed 50%, #fff5f8 100%)'
    }}>
      <main style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '24px',
        minHeight: '100vh'
      }}>
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
              background: 'linear-gradient(145deg, #fff5f8 0%, #ffe8f0 100%)',
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
                    background: 'linear-gradient(135deg, #ff6b9d 0%, #ff8fab 100%)',
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
          marginBottom: '28px',
          padding: '20px 28px',
          background: 'linear-gradient(135deg, #ffffff 0%, #fff5f8 100%)',
          borderRadius: '20px',
          boxShadow: '0 4px 20px rgba(255, 107, 157, 0.1)',
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
                  background: 'linear-gradient(135deg, #ff6b9d 0%, #ff8fab 100%)',
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
          background: 'linear-gradient(145deg, #ffffff 0%, #fff5f8 100%)',
          padding: '24px',
          borderRadius: '20px',
          marginBottom: '24px',
          boxShadow: '0 4px 16px rgba(255, 107, 157, 0.08)',
          border: '2px solid #ffd6e7'
        }}>
          <div style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <input
              type="text"
              placeholder="🔍 搜索歌名..."
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
              placeholder="🎤 搜索歌手..."
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
              placeholder="🏷️ 搜索标签..."
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
                  ? 'linear-gradient(135deg, #8b0000 0%, #a52a2a 100%)'
                  : 'linear-gradient(135deg, #ffe4e1 0%, #ffd5d5 100%)',
                color: showFeaturedOnly ? 'white' : '#8b0000',
                border: showFeaturedOnly ? '2px solid #8b0000' : '2px solid #ffc0cb',
                padding: '12px 24px',
                borderRadius: '20px',
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
                background: 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)',
                color: '#ff6b9d',
                border: '2px solid #ffd6e7',
                padding: '12px 24px',
                borderRadius: '20px',
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
                e.currentTarget.style.background = 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              清除搜索
            </button>
          </div>
          <div style={{
            color: '#ff8fab',
            fontSize: '15px',
            fontWeight: '500',
            padding: '10px 16px',
            background: '#fff5f8',
            borderRadius: '12px',
            display: 'inline-block'
          }}>
            🎵 共 <strong style={{ color: '#ff6b9d' }}>{songs.length}</strong> 首歌 / 展示 <strong style={{ color: '#ff6b9d' }}>{filteredSongs.length}</strong> 首歌
          </div>
        </div>

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
              marginBottom: '24px',
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

        {showForm && (
          <form
            onSubmit={addSong}
            style={{
              background: 'linear-gradient(145deg, #ffffff 0%, #fff5f8 100%)',
              padding: '28px',
              borderRadius: '24px',
              marginBottom: '24px',
              boxShadow: '0 4px 20px rgba(255, 107, 157, 0.12)',
              border: '2px solid #ffd6e7'
            }}
          >
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
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                placeholder="输入歌曲名称"
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
                value={singersInput}
                onChange={(e) => setSingersInput(e.target.value)}
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
                placeholder="如：小时姑娘，winky诗"
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

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                marginBottom: '16px',
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
                      background: 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)',
                      color: '#ff6b9d',
                      cursor: 'pointer',
                      fontSize: '20px',
                      fontWeight: 'bold',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (key !== null) {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #ffe8f0 0%, #ffd6e7 100%)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (key !== null) {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)';
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
                      background: 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)',
                      color: '#ff6b9d',
                      cursor: 'pointer',
                      fontSize: '20px',
                      fontWeight: 'bold',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (key !== null) {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #ffe8f0 0%, #ffd6e7 100%)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (key !== null) {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)';
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
                    background: key === null ? 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)' : '#fff',
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
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontWeight: 'bold',
                color: '#8b0000',
                cursor: 'pointer',
                padding: '12px 16px',
                background: featured ? 'linear-gradient(135deg, #ffe4e1 0%, #ffd5d5 100%)' : '#fff5f8',
                borderRadius: '16px',
                border: featured ? '2px solid #8b0000' : '2px solid #ffd6e7',
                transition: 'all 0.3s ease'
              }}>
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                  style={{
                    width: '20px',
                    height: '20px',
                    cursor: 'pointer',
                    accentColor: '#8b0000'
                  }}
                />
                <span>⭐ featured</span>
              </label>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#ff6b9d' }}>
                📝 备注
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '16px',
                  border: '2px solid #ffcce0',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  minHeight: '80px',
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

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? '#ffd6e7' : 'linear-gradient(135deg, #ff6b9d 0%, #ff8fab 100%)',
                color: 'white',
                border: 'none',
                padding: '14px 36px',
                borderRadius: '24px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(255, 107, 157, 0.35)',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 107, 157, 0.45)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(255, 107, 157, 0.35)';
                }
              }}
            >
              {loading ? '保存中... 💾' : '保存 '}
            </button>
          </form>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
          <div>
            <h2 style={{
              fontSize: '22px',
              marginBottom: '18px',
              color: '#ff6b9d',
              fontWeight: 'bold',
              padding: '0 8px'
            }}>
              🎶 歌曲列表 ({filteredSongs.length}/{songs.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredSongs.map((song) => (
                <div
                  key={song.id}
                  onClick={() => {
                    setSelectedSong(song);
                    setIsEditing(false);
                  }}
                  style={{
                    background: selectedSong?.id === song.id
                      ? 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)'
                      : 'linear-gradient(135deg, #ffffff 0%, #fffafc 100%)',
                    padding: '20px',
                    borderRadius: '18px',
                    boxShadow: selectedSong?.id === song.id
                      ? '0 4px 16px rgba(255, 107, 157, 0.25)'
                      : '0 2px 8px rgba(255, 107, 157, 0.08)',
                    cursor: 'pointer',
                    border: selectedSong?.id === song.id ? '2px solid #ff6b9d' : '2px solid #ffe8f0',
                    transition: 'all 0.3s ease',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedSong?.id !== song.id) {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 107, 157, 0.15)';
                      e.currentTarget.style.border = '2px solid #ffd6e7';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedSong?.id !== song.id) {
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 107, 157, 0.08)';
                      e.currentTarget.style.border = '2px solid #ffe8f0';
                    }
                  }}
                >
                  {/* 主打歌标识 - 仅主打歌显示 */}
                  {song.featured && (
                    <div style={{
                      position: 'absolute',
                      top: '10px',
                      right: '12px',
                      padding: '4px 10px',
                      backgroundColor: '#8b0000',
                      color: 'white',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      letterSpacing: '0.5px'
                    }}>
                      featured
                    </div>
                  )}

                  <div style={{
                    fontWeight: 'bold',
                    fontSize: '19px',
                    marginBottom: '10px',
                    color: '#333',
                    paddingRight: song.featured ? '70px' : '0'
                  }}>
                    {song.name}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {song.singers.map((singer, i) => (
                      <span
                        key={i}
                        style={{
                          background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                          color: '#8b7bf7',
                          padding: '6px 14px',
                          borderRadius: '14px',
                          fontSize: '13px',
                          fontWeight: '600',
                          border: '1px solid #ddd6fe'
                        }}
                      >
                        🎤 {singer}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      background: song.key === null
                        ? 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)'
                        : 'linear-gradient(135deg, #f0f9ff 0%, #e0f4f8 100%)',
                      color: song.key === null ? '#9e9e9e' : '#6bb3c7',
                      padding: '6px 14px',
                      borderRadius: '14px',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      border: song.key === null ? '2px solid #9e9e9e' : '2px solid #6bb3c7'
                    }}>
                      🎹 {formatKey(song.key)}
                    </span>
                    {song.tags.map((tag, i) => (
                      <span
                        key={i}
                        style={{
                          background: 'linear-gradient(135deg, #e8f5e9 0%, #d4edda 100%)',
                          color: '#2e7d32',
                          padding: '6px 14px',
                          borderRadius: '14px',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                      >
                        🏷️ {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {isLoadingSongs ? (
                <div style={{
                  textAlign: 'center',
                  padding: '80px 40px',
                  background: 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)',
                  borderRadius: '20px',
                  border: '2px dashed #ffd6e7'
                }}>
                  <div style={{
                    width: '50px',
                    height: '50px',
                    border: '4px solid #ffe8f0',
                    borderTop: '4px solid #ff6b9d',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 20px'
                  }} />
                  <style>{`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
                  <p style={{ color: '#ff8fab', fontSize: '16px' }}>正在加载歌曲...</p>
                </div>
              ) : filteredSongs.length === 0 && (
                <div style={{
                  padding: '60px 40px',
                  background: 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)',
                  borderRadius: '20px',
                  textAlign: 'center',
                  border: '2px dashed #ffd6e7'
                }}>
                  <p style={{
                    color: '#ff6b9d',
                    fontSize: '16px',
                    fontWeight: '500',
                    margin: 0
                  }}>
                    {songs.length === 0 ? '还没有歌曲，添加一首吧！' : '🔍 没有匹配的歌曲'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div style={{
            position: 'sticky',
            top: '24px'
          }}>
            {selectedSong ? (
              isEditing ? (
                // 编辑模式
                <form
                  onSubmit={saveEdit}
                  style={{
                    background: 'linear-gradient(145deg, #ffffff 0%, #fff5f8 100%)',
                    padding: '28px',
                    borderRadius: '24px',
                    boxShadow: '0 4px 20px rgba(255, 107, 157, 0.15)',
                    border: '2px solid #ffd6e7'
                  }}
                >
                  <h2 style={{
                    fontSize: '24px',
                    marginBottom: '24px',
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

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '16px',
                      fontWeight: 'bold',
                      color: '#ff6b9d'
                    }}>
                      🎹 升降调
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        onClick={() => editKey === null && setEditKey(0)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px 16px',
                          background: '#fff5f8',
                          borderRadius: '16px',
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
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            border: '2px solid #ff6b9d',
                            background: 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)',
                            color: '#ff6b9d',
                            cursor: 'pointer',
                            fontSize: '20px',
                            fontWeight: 'bold',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (editKey !== null) {
                              e.currentTarget.style.background = 'linear-gradient(135deg, #ffe8f0 0%, #ffd6e7 100%)';
                              e.currentTarget.style.transform = 'scale(1.05)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (editKey !== null) {
                              e.currentTarget.style.background = 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)';
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
                          {formatKey(editKey)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditKey(k => k === null ? 0 : k + 1); }}
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            border: '2px solid #ff6b9d',
                            background: 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)',
                            color: '#ff6b9d',
                            cursor: 'pointer',
                            fontSize: '20px',
                            fontWeight: 'bold',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (editKey !== null) {
                              e.currentTarget.style.background = 'linear-gradient(135deg, #ffe8f0 0%, #ffd6e7 100%)';
                              e.currentTarget.style.transform = 'scale(1.05)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (editKey !== null) {
                              e.currentTarget.style.background = 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)';
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
                          padding: '10px 16px',
                          borderRadius: '12px',
                          border: editKey === null ? '2px solid #9e9e9e' : '2px solid #e0e0e0',
                          background: editKey === null ? 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)' : '#fff',
                          color: editKey === null ? '#757575' : '#bdbdbd',
                          cursor: 'pointer',
                          fontSize: '14px',
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
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontWeight: 'bold',
                      color: '#8b0000',
                      cursor: 'pointer',
                      padding: '12px 16px',
                      background: editFeatured ? 'linear-gradient(135deg, #ffe4e1 0%, #ffd5d5 100%)' : '#fff5f8',
                      borderRadius: '16px',
                      border: editFeatured ? '2px solid #8b0000' : '2px solid #ffd6e7',
                      transition: 'all 0.3s ease'
                    }}>
                      <input
                        type="checkbox"
                        checked={editFeatured}
                        onChange={(e) => setEditFeatured(e.target.checked)}
                        style={{
                          width: '20px',
                          height: '20px',
                          cursor: 'pointer',
                          accentColor: '#8b0000'
                        }}
                      />
                      <span>⭐ featured</span>
                    </label>
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#ff6b9d' }}>
                      📝 备注
                    </label>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '16px',
                        border: '2px solid #ffcce0',
                        fontSize: '15px',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                        minHeight: '80px',
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

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="submit"
                      disabled={loading}
                      style={{
                        flex: 1,
                        background: loading ? '#ffd6e7' : 'linear-gradient(135deg, #ff6b9d 0%, #ff8fab 100%)',
                        color: 'white',
                        border: 'none',
                        padding: '14px 24px',
                        borderRadius: '20px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        boxShadow: loading ? 'none' : '0 4px 16px rgba(255, 107, 157, 0.35)',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 107, 157, 0.45)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = loading ? 'none' : '0 4px 16px rgba(255, 107, 157, 0.35)';
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
                        padding: '14px 24px',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        fontSize: '16px',
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
                  background: 'linear-gradient(145deg, #ffffff 0%, #fff5f8 100%)',
                  padding: '28px',
                  borderRadius: '24px',
                  boxShadow: '0 4px 20px rgba(255, 107, 157, 0.15)',
                  border: '2px solid #ffd6e7'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <h2 style={{
                      fontSize: '26px',
                      color: '#ff6b9d',
                      fontWeight: 'bold',
                      margin: 0
                    }}>{selectedSong.name}</h2>
                    {/* 主打歌标识 */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: selectedSong.featured ? '6px 12px' : '6px 10px',
                      backgroundColor: selectedSong.featured ? '#8b0000' : '#f0d0d0',
                      color: selectedSong.featured ? 'white' : '#b87070',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 'bold'
                    }}>
                      <span>{selectedSong.featured ? '⭐' : '☆'}</span>
                      {selectedSong.featured && <span>featured</span>}
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{
                      display: 'block',
                      color: '#ff8fab',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      marginBottom: '10px'
                    }}>🎤 参考歌手</label>
                    <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {selectedSong.singers.map((singer, i) => (
                        <span
                          key={i}
                          style={{
                            background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                            color: '#8b7bf7',
                            padding: '8px 16px',
                            borderRadius: '16px',
                            fontSize: '14px',
                            fontWeight: '600',
                            border: '1px solid #ddd6fe'
                          }}
                        >
                          {singer}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{
                      display: 'block',
                      color: '#ff8fab',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      marginBottom: '10px'
                    }}>🎹 升降调</label>
                    <div style={{
                      fontSize: '20px',
                      marginTop: '12px',
                      fontWeight: 'bold',
                      color: selectedSong.key === null ? '#9e9e9e' : '#6bb3c7',
                      background: selectedSong.key === null ? '#f5f5f5' : '#f0f9ff',
                      padding: '10px 16px',
                      borderRadius: '16px',
                      border: selectedSong.key === null ? '2px solid #9e9e9e' : '2px solid #6bb3c7',
                      display: 'inline-block'
                    }}>
                      {formatKey(selectedSong.key)}
                    </div>
                  </div>

                  {selectedSong.tags.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                      <label style={{
                        display: 'block',
                        color: '#ff8fab',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        marginBottom: '10px'
                      }}>🏷️ 标签</label>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {selectedSong.tags.map((tag, i) => (
                          <span
                            key={i}
                            style={{
                              background: 'linear-gradient(135deg, #e8f5e9 0%, #d4edda 100%)',
                              color: '#2e7d32',
                              padding: '8px 16px',
                              borderRadius: '16px',
                              fontSize: '14px',
                              fontWeight: '500'
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ color: '#ff6b9d', fontSize: '14px', fontWeight: 'bold' }}>📝 备注</label>
                    <div style={{
                      marginTop: '10px',
                      padding: '16px 20px',
                      background: selectedSong.notes ? 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)' : '#f8f9fa',
                      borderRadius: '18px',
                      border: '2px solid ' + (selectedSong.notes ? '#ffd6e7' : '#e9ecef'),
                      minHeight: selectedSong.notes ? 'auto' : '60px',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.3s ease'
                    }}>
                      <span style={{
                        fontSize: '15px',
                        color: selectedSong.notes ? '#ff6b9d' : '#adb5bd',
                        lineHeight: '1.6'
                      }}>
                        {selectedSong.notes ? selectedSong.notes : '无备注~'}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    color: '#ff8fab',
                    fontSize: '13px',
                    marginBottom: '24px',
                    padding: '12px 16px',
                    background: '#fff0f5',
                    borderRadius: '12px',
                    border: '1px dashed #ffd6e7'
                  }}>
                    🕐 添加时间: {new Date(selectedSong.createdAt).toLocaleString('zh-CN')}
                  </div>

                  {isAdmin ? (
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        onClick={startEdit}
                        style={{
                          flex: 1,
                          background: 'linear-gradient(135deg, #2196F3 0%, #64b5f6 100%)',
                          color: 'white',
                          border: 'none',
                          padding: '14px 24px',
                          borderRadius: '20px',
                          cursor: 'pointer',
                          fontSize: '16px',
                          fontWeight: 'bold',
                          boxShadow: '0 4px 16px rgba(33, 150, 243, 0.35)',
                          transition: 'all 0.3s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 6px 20px rgba(33, 150, 243, 0.45)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(33, 150, 243, 0.35)';
                        }}
                      >
                        编辑 ✏️
                      </button>
                      <button
                        onClick={() => removeSong(selectedSong.id)}
                        style={{
                          width: '48px',
                          height: '48px',
                          background: 'linear-gradient(135deg, #f44336 0%, #ef5350 100%)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '18px',
                          fontWeight: 'bold',
                          boxShadow: '0 4px 16px rgba(244, 67, 54, 0.35)',
                          transition: 'all 0.3s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 6px 20px rgba(244, 67, 54, 0.45)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(244, 67, 54, 0.35)';
                        }}
                        title="删除"
                      >
                        🗑️
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      padding: '16px',
                      background: 'linear-gradient(135deg, #fff5f8 0%, #ffe8f0 100%)',
                      borderRadius: '16px',
                      textAlign: 'center',
                      color: '#ff6b9d',
                      fontSize: '15px',
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
                background: 'linear-gradient(145deg, #fff5f8 0%, #ffe8f0 100%)',
                padding: '60px 40px',
                borderRadius: '24px',
                textAlign: 'center',
                color: '#ff8fab',
                border: '2px dashed #ffd6e7',
                boxShadow: '0 4px 16px rgba(255, 107, 157, 0.08)'
              }}>
                <div style={{
                  fontSize: '48px',
                  marginBottom: '16px',
                  opacity: 0.8
                }}>🎵</div>
                <p style={{
                  fontSize: '16px',
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
