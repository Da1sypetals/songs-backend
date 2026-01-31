'use client';

import { useState, useEffect } from 'react';
import { Song, CreateSongRequest } from '@/types/song';

export default function Home() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // 表单状态
  const [name, setName] = useState('');
  const [singersInput, setSingersInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [key, setKey] = useState(0);

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

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
        // 重置表单
        setName('');
        setSingersInput('');
        setTagsInput('');
        setKey(0);
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
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '24px', color: '#333' }}>
        🎵 我的歌单
      </h1>

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
              placeholder="如：周杰伦, 林俊杰"
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
              placeholder="如：流行, 抒情, 经典"
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>歌曲列表 ({songs.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {songs.map((song) => (
              <div
                key={song.id}
                onClick={() => setSelectedSong(song)}
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
                <div style={{ color: '#666', fontSize: '14px' }}>
                  歌手: {song.singers.join(', ')}
                </div>
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    background: '#e0e0e0',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    调: {formatKey(song.key)}
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
            {songs.length === 0 && (
              <p style={{ color: '#999', textAlign: 'center', padding: '40px' }}>
                还没有歌曲，添加一首吧！
              </p>
            )}
          </div>
        </div>

        <div>
          {selectedSong ? (
            <div style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>{selectedSong.name}</h2>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ color: '#666', fontSize: '14px' }}>参考歌手</label>
                <div style={{ fontSize: '18px', marginTop: '4px' }}>
                  {selectedSong.singers.join(', ')}
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

              <button
                onClick={() => removeSong(selectedSong.id)}
                style={{
                  background: '#f44336',
                  color: 'white',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  width: '100%'
                }}
              >
                删除这首歌
              </button>
            </div>
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
