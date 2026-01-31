'use client';

import { useState, useEffect, useMemo } from 'react';
import { Song, CreateSongRequest } from '@/types/song';

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

    // 3. 按key绝对值排序（从小到大）
    return Math.abs(a.key) - Math.abs(b.key);
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
  const [key, setKey] = useState(0);

  // 搜索框状态
  const [searchName, setSearchName] = useState('');
  const [searchSinger, setSearchSinger] = useState('');
  const [searchTag, setSearchTag] = useState('');

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // 编辑表单状态
  const [editName, setEditName] = useState('');
  const [editSingersInput, setEditSingersInput] = useState('');
  const [editTagsInput, setEditTagsInput] = useState('');
  const [editKey, setEditKey] = useState(0);

  // 客户端缓存
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const CACHE_DURATION = 30000; // 30秒缓存

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
  }, [songs, searchName, searchSinger, searchTag]);

  // 清除所有搜索
  const clearAllFilters = () => {
    setSearchName('');
    setSearchSinger('');
    setSearchTag('');
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
        setName('');
        setSingersInput('');
        setTagsInput('');
        setKey(0);
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
    setIsEditing(true);
  };

  // 取消编辑
  const cancelEdit = () => {
    setIsEditing(false);
  };

  // 保存编辑
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          key: editKey
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

  const formatKey = (key: number) => {
    if (key > 0) return `+${key}`;
    if (key < 0) return `${key}`;
    return '原调';
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  // 搜索框样式
  const searchInputStyle = {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    flex: 1,
    minWidth: '150px'
  };

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '24px', color: '#333' }}>
        🎵 Daisy的歌单
      </h1>

      {/* 搜索区域 */}
      <div style={{
        background: '#f8f9fa',
        padding: '20px',
        borderRadius: '12px',
        marginBottom: '20px'
      }}>
        <div style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <input
            type="text"
            placeholder="搜索歌名..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            style={searchInputStyle}
          />
          <input
            type="text"
            placeholder="搜索歌手..."
            value={searchSinger}
            onChange={(e) => setSearchSinger(e.target.value)}
            style={searchInputStyle}
          />
          <input
            type="text"
            placeholder="搜索标签..."
            value={searchTag}
            onChange={(e) => setSearchTag(e.target.value)}
            style={searchInputStyle}
          />
          <button
            onClick={clearAllFilters}
            style={{
              background: '#6c757d',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              whiteSpace: 'nowrap'
            }}
          >
            清除搜索
          </button>
        </div>
        <div style={{ color: '#666', fontSize: '14px' }}>
          共 <strong>{songs.length}</strong> 首歌 / 展示 <strong>{filteredSongs.length}</strong> 首歌
        </div>
      </div>

      <button
        onClick={() => setShowForm(!showForm)}
        style={{
          background: '#4CAF50',
          color: 'white',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          marginBottom: '24px'
        }}
      >
        {showForm ? '取消' : '+ 添加歌曲'}
      </button>

      {showForm && (
        <form
          onSubmit={addSong}
          style={{
            background: '#f5f5f5',
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '24px'
          }}
        >
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              歌曲名称 *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              placeholder="输入歌曲名称"
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              参考歌手 *（多个用逗号分隔）
            </label>
            <input
              type="text"
              value={singersInput}
              onChange={(e) => setSingersInput(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              placeholder="如：小时姑娘，winky诗"
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              标签（多个用逗号分隔）
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              placeholder="如：古风，对唱，三拍子，原耽"
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              升降调
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setKey(k => k - 1)}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: '1px solid #ddd',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '20px'
                }}
              >
                -
              </button>
              <span style={{
                fontSize: '18px',
                fontWeight: 'bold',
                minWidth: '60px',
                textAlign: 'center'
              }}>
                {formatKey(key)}
              </span>
              <button
                type="button"
                onClick={() => setKey(k => k + 1)}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: '1px solid #ddd',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '20px'
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
              background: loading ? '#ccc' : '#2196F3',
              color: 'white',
              border: 'none',
              padding: '12px 32px',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px'
            }}
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
        <div>
          <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>
            歌曲列表 ({filteredSongs.length}/{songs.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredSongs.map((song) => (
              <div
                key={song.id}
                onClick={() => {
                  setSelectedSong(song);
                  setIsEditing(false);
                }}
                style={{
                  background: selectedSong?.id === song.id ? '#e3f2fd' : 'white',
                  padding: '16px',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  cursor: 'pointer',
                  border: selectedSong?.id === song.id ? '2px solid #2196F3' : '2px solid transparent'
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '8px' }}>
                  {song.name}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {song.singers.map((singer, i) => (
                    <span
                      key={i}
                      style={{
                        background: '#f3e5f5',
                        color: '#7b1fa2',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '12px'
                      }}
                    >
                      {singer}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    background: '#e0e0e0',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    key: {formatKey(song.key)}
                  </span>
                  {song.tags.map((tag, i) => (
                    <span
                      key={i}
                      style={{
                        background: '#e8f5e9',
                        color: '#2e7d32',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {isLoadingSongs ? (
              <div style={{ textAlign: 'center', padding: '60px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  border: '4px solid #f3f3f3',
                  borderTop: '4px solid #2196F3',
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
                <p style={{ color: '#666' }}>加载中...</p>
              </div>
            ) : filteredSongs.length === 0 && (
              <p style={{ color: '#999', textAlign: 'center', padding: '40px' }}>
                {songs.length === 0 ? '还没有歌曲，添加一首吧！' : '没有匹配的歌曲'}
              </p>
            )}
          </div>
        </div>

        <div style={{ position: 'sticky', top: '20px' }}>
          {selectedSong ? (
            isEditing ? (
              // 编辑模式
              <form
                onSubmit={saveEdit}
                style={{
                  background: 'white',
                  padding: '24px',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
              >
                <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>编辑歌曲</h2>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    歌曲名称 *
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid #ddd',
                      fontSize: '16px',
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    参考歌手 *（多个用逗号分隔）
                  </label>
                  <input
                    type="text"
                    value={editSingersInput}
                    onChange={(e) => setEditSingersInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid #ddd',
                      fontSize: '16px',
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    标签（多个用逗号分隔）
                  </label>
                  <input
                    type="text"
                    value={editTagsInput}
                    onChange={(e) => setEditTagsInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid #ddd',
                      fontSize: '16px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    升降调
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setEditKey(k => k - 1)}
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        border: '1px solid #ddd',
                        background: 'white',
                        cursor: 'pointer',
                        fontSize: '20px'
                      }}
                    >
                      -
                    </button>
                    <span style={{
                      fontSize: '18px',
                      fontWeight: 'bold',
                      minWidth: '60px',
                      textAlign: 'center'
                    }}>
                      {formatKey(editKey)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditKey(k => k + 1)}
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        border: '1px solid #ddd',
                        background: 'white',
                        cursor: 'pointer',
                        fontSize: '20px'
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    style={{
                      flex: 1,
                      background: '#6c757d',
                      color: 'white',
                      border: 'none',
                      padding: '12px 24px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '16px'
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      flex: 1,
                      background: loading ? '#ccc' : '#4CAF50',
                      color: 'white',
                      border: 'none',
                      padding: '12px 24px',
                      borderRadius: '8px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '16px'
                    }}
                  >
                    {loading ? '保存中...' : '保存'}
                  </button>
                </div>
              </form>
            ) : (
              // 查看模式
              <div style={{
                background: 'white',
                padding: '24px',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>{selectedSong.name}</h2>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ color: '#666', fontSize: '14px' }}>参考歌手</label>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {selectedSong.singers.map((singer, i) => (
                      <span
                        key={i}
                        style={{
                          background: '#f3e5f5',
                          color: '#7b1fa2',
                          padding: '6px 14px',
                          borderRadius: '16px',
                          fontSize: '14px'
                        }}
                      >
                        {singer}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ color: '#666', fontSize: '14px' }}>升降调</label>
                  <div style={{ fontSize: '18px', marginTop: '4px', fontWeight: 'bold', color: '#2196F3' }}>
                    {formatKey(selectedSong.key)}
                  </div>
                </div>

                {selectedSong.tags.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ color: '#666', fontSize: '14px' }}>标签</label>
                    <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {selectedSong.tags.map((tag, i) => (
                        <span
                          key={i}
                          style={{
                            background: '#e8f5e9',
                            color: '#2e7d32',
                            padding: '6px 12px',
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

                <div style={{ color: '#999', fontSize: '12px', marginBottom: '24px' }}>
                  添加时间: {new Date(selectedSong.createdAt).toLocaleString('zh-CN')}
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={startEdit}
                    style={{
                      flex: 1,
                      background: '#2196F3',
                      color: 'white',
                      border: 'none',
                      padding: '12px 24px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '16px'
                    }}
                  >
                    编辑
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
                      fontSize: '16px'
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            )
          ) : (
            <div style={{
              background: '#f5f5f5',
              padding: '40px',
              borderRadius: '12px',
              textAlign: 'center',
              color: '#999'
            }}>
              点击左侧歌曲查看详情
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
