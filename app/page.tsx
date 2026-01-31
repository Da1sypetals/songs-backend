'use client';

import { useState, useEffect, useMemo } from 'react';
import { Song, CreateSongRequest } from '@/types/song';

// 主题色
const theme = {
  bg: '#fff0f5',           // 浅粉色背景
  cardBg: '#ffffff',
  primary: '#ff69b4',      // 热粉色
  primaryLight: '#ffb6c1', // 浅粉色
  singer: '#9c27b0',       // 紫色 - 歌手
  singerBg: '#f3e5f5',     // 浅紫色背景
  tag: '#2e7d32',          // 绿色 - 标签
  tagBg: '#e8f5e9',        // 浅绿色背景
  text: '#333333',
  textSecondary: '#666666',
  border: '#ffc0cb',
};

export default function Home() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // 搜索框状态
  const [nameFilter, setNameFilter] = useState('');
  const [singerFilter, setSingerFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  // 表单状态（添加/编辑共用）
  const [name, setName] = useState('');
  const [singersInput, setSingersInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [key, setKey] = useState(0);

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const fetchSongs = async () => {
    try {
      const response = await fetch('/api/songs');
      const data = await response.json();
      if (data.success) {
        setSongs(data.data);
      }
    } catch (error) {
      console.error('获取歌曲列表失败:', error);
    }
  };

  // 过滤逻辑 - AND 关系
  const filteredSongs = useMemo(() => {
    const nameQuery = nameFilter.trim().toLowerCase();
    const singerQuery = singerFilter.trim().toLowerCase();
    const tagQuery = tagFilter.trim().toLowerCase();

    return songs.filter(song => {
      // 歌曲名过滤
      if (nameQuery && !song.name.toLowerCase().includes(nameQuery)) {
        return false;
      }
      // 歌手过滤（任一歌手匹配即可）
      if (singerQuery && !song.singers.some(s => s.toLowerCase().includes(singerQuery))) {
        return false;
      }
      // 标签过滤（任一标签匹配即可）
      if (tagQuery && !song.tags.some(t => t.toLowerCase().includes(tagQuery))) {
        return false;
      }
      return true;
    });
  }, [songs, nameFilter, singerFilter, tagFilter]);

  const clearFilters = () => {
    setNameFilter('');
    setSingerFilter('');
    setTagFilter('');
  };

  const resetForm = () => {
    setName('');
    setSingersInput('');
    setTagsInput('');
    setKey(0);
  };

  const startEditing = (song: Song) => {
    setSelectedSong(song);
    setIsEditing(true);
    setName(song.name);
    setSingersInput(song.singers.join(', '));
    setTagsInput(song.tags.join(', '));
    setKey(song.key);
    setShowForm(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setShowForm(false);
    resetForm();
  };

  const addSong = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const singers = singersInput.split(/[,，]/).map(s => s.trim()).filter(s => s);
      const tags = tagsInput.split(/[,，]/).map(t => t.trim()).filter(t => t);

      const request: CreateSongRequest = {
        name,
        singers,
        tags,
        key
      };

      const response = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      const data = await response.json();
      if (data.success) {
        resetForm();
        setShowForm(false);
        fetchSongs();
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

  const updateSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSong) return;

    setLoading(true);
    try {
      const singers = singersInput.split(/[,，]/).map(s => s.trim()).filter(s => s);
      const tags = tagsInput.split(/[,，]/).map(t => t.trim()).filter(t => t);

      const response = await fetch(`/api/songs/${selectedSong.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          singers,
          tags,
          key
        })
      });

      const data = await response.json();
      if (data.success) {
        setIsEditing(false);
        setShowForm(false);
        resetForm();
        setSelectedSong(data.data);
        fetchSongs();
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

  const removeSong = async (id: string) => {
    if (!confirm('确定要删除这首歌吗？')) return;

    try {
      const response = await fetch(`/api/songs/${id}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {
        if (selectedSong?.id === id) {
          setSelectedSong(null);
        }
        fetchSongs();
      } else {
        alert(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除歌曲失败:', error);
      alert('删除失败');
    }
  };

  const formatKey = (key: number) => {
    if (key > 0) return `+${key}`;
    if (key < 0) return `${key}`;
    return '原调';
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  return (
    <main style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '24px',
      minHeight: '100vh',
      background: theme.bg
    }}>
      <h1 style={{
        fontSize: '32px',
        fontWeight: 'bold',
        marginBottom: '24px',
        color: theme.primary
      }}>
        🥕 我的歌单
      </h1>

      {/* 搜索框区域 */}
      <div style={{
        background: theme.cardBg,
        padding: '20px',
        borderRadius: '12px',
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(255, 105, 180, 0.15)'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '16px'
        }}>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: '14px',
              color: theme.textSecondary,
              fontWeight: 'bold'
            }}>
              搜索歌名
            </label>
            <input
              type="text"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="输入歌名..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: `2px solid ${theme.border}`,
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
          </div>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: '14px',
              color: theme.textSecondary,
              fontWeight: 'bold'
            }}>
              搜索歌手
            </label>
            <input
              type="text"
              value={singerFilter}
              onChange={(e) => setSingerFilter(e.target.value)}
              placeholder="输入歌手..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: `2px solid ${theme.border}`,
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
          </div>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: '14px',
              color: theme.textSecondary,
              fontWeight: 'bold'
            }}>
              搜索标签
            </label>
            <input
              type="text"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="输入标签..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: `2px solid ${theme.border}`,
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            onClick={clearFilters}
            style={{
              background: 'transparent',
              color: theme.primary,
              border: `2px solid ${theme.primary}`,
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            🗑️ Remove all filters
          </button>
          <span style={{ color: theme.textSecondary, fontSize: '14px' }}>
            共 <strong style={{ color: theme.primary }}>{songs.length}</strong> 首歌
            {filteredSongs.length !== songs.length && (
              <>，展示 <strong style={{ color: theme.primary }}>{filteredSongs.length}</strong> 首</>
            )}
          </span>
        </div>
      </div>

      <button
        onClick={() => {
          if (isEditing) cancelEditing();
          else setShowForm(!showForm);
        }}
        style={{
          background: theme.primary,
          color: 'white',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          marginBottom: '24px',
          fontWeight: 'bold',
          boxShadow: '0 2px 8px rgba(255, 105, 180, 0.3)'
        }}
      >
        {showForm ? '取消' : '+ 添加歌曲'}
      </button>

      {showForm && (
        <form
          onSubmit={isEditing ? updateSong : addSong}
          style={{
            background: theme.cardBg,
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 2px 8px rgba(255, 105, 180, 0.15)',
            border: `2px solid ${theme.border}`
          }}
        >
          <h3 style={{
            marginTop: 0,
            marginBottom: '20px',
            color: theme.primary,
            fontSize: '20px'
          }}>
            {isEditing ? '✏️ 编辑歌曲' : '🎵 添加新歌曲'}
          </h3>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: 'bold',
              color: theme.text
            }}>
              歌曲名称 *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `2px solid ${theme.border}`,
                fontSize: '16px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
              placeholder="输入歌曲名称"
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: 'bold',
              color: theme.text
            }}>
              参考歌手 *（多个用逗号分隔）
            </label>
            <input
              type="text"
              value={singersInput}
              onChange={(e) => setSingersInput(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `2px solid ${theme.border}`,
                fontSize: '16px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
              placeholder="如：小时姑娘，winky诗"
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: 'bold',
              color: theme.text
            }}>
              标签（多个用逗号分隔）
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `2px solid ${theme.border}`,
                fontSize: '16px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
              placeholder="如：古风，对唱，三拍子，原耽"
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: 'bold',
              color: theme.text
            }}>
              升降调
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setKey(k => k - 1)}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  border: `2px solid ${theme.primary}`,
                  background: 'white',
                  color: theme.primary,
                  cursor: 'pointer',
                  fontSize: '20px',
                  fontWeight: 'bold'
                }}
              >
                -
              </button>
              <span style={{
                fontSize: '20px',
                fontWeight: 'bold',
                minWidth: '60px',
                textAlign: 'center',
                color: theme.primary
              }}>
                {formatKey(key)}
              </span>
              <button
                type="button"
                onClick={() => setKey(k => k + 1)}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  border: `2px solid ${theme.primary}`,
                  background: 'white',
                  color: theme.primary,
                  cursor: 'pointer',
                  fontSize: '20px',
                  fontWeight: 'bold'
                }}
              >
                +
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? '#ccc' : theme.primary,
              color: 'white',
              border: 'none',
              padding: '14px 32px',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              width: '100%'
            }}
          >
            {loading ? (isEditing ? '更新中...' : '保存中...') : (isEditing ? '更新歌曲' : '保存歌曲')}
          </button>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <h2 style={{
            fontSize: '18px',
            marginBottom: '16px',
            color: theme.text
          }}>
            歌曲列表 ({filteredSongs.length}/{songs.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredSongs.map((song) => (
              <div
                key={song.id}
                onClick={() => setSelectedSong(song)}
                style={{
                  background: selectedSong?.id === song.id ? theme.primaryLight : theme.cardBg,
                  padding: '16px',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(255, 105, 180, 0.1)',
                  cursor: 'pointer',
                  border: selectedSong?.id === song.id ? `2px solid ${theme.primary}` : '2px solid transparent',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{
                  fontWeight: 'bold',
                  fontSize: '18px',
                  marginBottom: '10px',
                  color: theme.text
                }}>
                  {song.name}
                </div>

                {/* 歌手 - 紫色标签 */}
                <div style={{
                  display: 'flex',
                  gap: '6px',
                  flexWrap: 'wrap',
                  marginBottom: '8px'
                }}>
                  {song.singers.map((singer, i) => (
                    <span
                      key={i}
                      style={{
                        background: theme.singerBg,
                        color: theme.singer,
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}
                    >
                      {singer}
                    </span>
                  ))}
                </div>

                <div style={{
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                  alignItems: 'center'
                }}>
                  <span style={{
                    background: theme.primaryLight,
                    color: theme.primary,
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    {formatKey(song.key)}
                  </span>
                  {song.tags.map((tag, i) => (
                    <span
                      key={i}
                      style={{
                        background: theme.tagBg,
                        color: theme.tag,
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '12px'
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {filteredSongs.length === 0 && (
              <div style={{
                background: theme.cardBg,
                padding: '40px',
                borderRadius: '12px',
                textAlign: 'center',
                color: theme.textSecondary
              }}>
                {songs.length === 0 ? '还没有歌曲，添加一首吧！' : '没有匹配的歌曲'}
              </div>
            )}
          </div>
        </div>

        <div>
          {selectedSong ? (
            <div style={{
              background: theme.cardBg,
              padding: '24px',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(255, 105, 180, 0.15)',
              border: `2px solid ${theme.border}`
            }}>
              <h2 style={{
                fontSize: '24px',
                marginBottom: '16px',
                color: theme.primary
              }}>
                {selectedSong.name}
              </h2>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  color: theme.textSecondary,
                  fontSize: '14px',
                  display: 'block',
                  marginBottom: '8px'
                }}>
                  参考歌手
                </label>
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap'
                }}>
                  {selectedSong.singers.map((singer, i) => (
                    <span
                      key={i}
                      style={{
                        background: theme.singerBg,
                        color: theme.singer,
                        padding: '6px 14px',
                        borderRadius: '16px',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}
                    >
                      {singer}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  color: theme.textSecondary,
                  fontSize: '14px',
                  display: 'block',
                  marginBottom: '6px'
                }}>
                  升降调
                </label>
                <div style={{
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: theme.primary
                }}>
                  {formatKey(selectedSong.key)}
                </div>
              </div>

              {selectedSong.tags.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    color: theme.textSecondary,
                    fontSize: '14px',
                    display: 'block',
                    marginBottom: '8px'
                  }}>
                    标签
                  </label>
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap'
                  }}>
                    {selectedSong.tags.map((tag, i) => (
                      <span
                        key={i}
                        style={{
                          background: theme.tagBg,
                          color: theme.tag,
                          padding: '6px 14px',
                          borderRadius: '16px',
                          fontSize: '14px'
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{
                color: theme.textSecondary,
                fontSize: '12px',
                marginBottom: '20px'
              }}>
                添加时间: {new Date(selectedSong.createdAt).toLocaleString('zh-CN')}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => startEditing(selectedSong)}
                  style={{
                    flex: 1,
                    background: theme.primary,
                    color: 'white',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: 'bold'
                  }}
                >
                  ✏️ 编辑
                </button>
                <button
                  onClick={() => removeSong(selectedSong.id)}
                  style={{
                    flex: 1,
                    background: '#f44336',
                    color: 'white',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: 'bold'
                  }}
                >
                  🗑️ 删除
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              background: theme.cardBg,
              padding: '40px',
              borderRadius: '12px',
              textAlign: 'center',
              color: theme.textSecondary,
              boxShadow: '0 2px 8px rgba(255, 105, 180, 0.1)'
            }}>
              点击左侧歌曲查看详情
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
