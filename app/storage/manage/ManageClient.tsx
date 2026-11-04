'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const ADMIN_KEY = 'isAdmin';
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_SONGLIST_PASSWORD?.trim() || 'daisy2024';

const CHUNK_SIZE = 1_400_000;
const MP3_LIMIT = 104_857_600;
const OTHER_LIMIT = 20_971_520;
const FORMAT_LIMITS: Record<string, number> = {
  mp3: MP3_LIMIT,
  flac: OTHER_LIMIT,
  m4a: OTHER_LIMIT,
  aac: OTHER_LIMIT,
  wav: OTHER_LIMIT,
  ogg: OTHER_LIMIT,
  opus: OTHER_LIMIT,
  aiff: OTHER_LIMIT,
  wma: OTHER_LIMIT
};
const ACCEPT = '.mp3,.flac,.m4a,.aac,.wav,.ogg,.opus,.aiff,.wma';

interface CloudSong {
  sha256: string;
  name: string;
  singers: string[];
  format: string;
  byteSize: number;
  chunkCount: number;
  createdAt: string;
}

interface Quota {
  usedBytes: number;
  limitBytes: number;
}

interface Library {
  quota: Quota;
  songs: CloudSong[];
}

interface CreatedSong {
  sha256: string;
  name: string;
  byteSize: number;
  chunkCount: number;
  duplicated: boolean;
  uploadedChunks: number[];
}

type TaskPhase = 'queued' | 'hashing' | 'uploading' | 'done' | 'duplicate' | 'error';

interface UploadTask {
  id: string;
  file: File;
  name: string;
  singers: string;
  phase: TaskPhase;
  progress: number;
  message: string;
}

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '2px solid #ffd6e7',
  borderRadius: '16px',
  boxShadow: '0 2px 12px rgba(255, 107, 157, 0.08)',
  padding: '16px 20px',
  marginBottom: '16px'
};

const titleStyle: CSSProperties = {
  fontSize: '32px',
  fontWeight: 'bold',
  color: '#ff6b9d',
  margin: 0,
  textShadow: '2px 2px 4px rgba(255, 107, 157, 0.15)'
};

const sectionTitleStyle: CSSProperties = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#ff6b9d',
  margin: 0
};

const hintStyle: CSSProperties = {
  fontSize: '12px',
  color: '#93737b'
};

const inputStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: '14px',
  border: '2px solid #ffd6e7',
  background: '#fff8fb',
  fontSize: '14px',
  color: '#3b282c',
  outline: 'none',
  boxSizing: 'border-box'
};

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(255, 182, 193, 0.4)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
  padding: '16px'
};

const dialogStyle: CSSProperties = {
  background: '#fff5f8',
  padding: '28px',
  borderRadius: '24px',
  width: '100%',
  maxWidth: '380px',
  boxShadow: '0 8px 32px rgba(255, 107, 157, 0.2)',
  border: '2px solid #ffd6e7'
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} 字节`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let index = 0; index < bytes.length; index += 1) {
    out += bytes[index].toString(16).padStart(2, '0');
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(offset, offset + step)));
  }
  return btoa(binary);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', ...init });
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    if (response.status === 403 || response.status === 429) {
      throw new Error('访问被 Vercel 的安全校验拦下了，刷新页面后重试');
    }
    throw new Error(`服务器返回了 ${type || '未知类型'}（HTTP ${response.status}）`);
  }
  const payload = (await response.json()) as { success: boolean; error?: string; data?: T };
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  return payload.data as T;
}

function api<T>(method: string, path: string, body: unknown, password: string, signal: AbortSignal): Promise<T> {
  return readJson<T>(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-storage-password': password
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal
  });
}

function PrimaryButton(props: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const disabled = props.disabled === true;
  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={disabled}
      style={{
        padding: '11px 22px',
        borderRadius: '20px',
        border: 'none',
        background: disabled ? '#ffc2d6' : '#ff6b9d',
        color: 'white',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        fontWeight: 'bold',
        boxShadow: disabled ? 'none' : '0 4px 12px rgba(255, 107, 157, 0.3)',
        transition: 'all 0.3s ease'
      }}
      onMouseEnter={(event) => {
        if (disabled) return;
        event.currentTarget.style.transform = 'translateY(-2px)';
        event.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 107, 157, 0.4)';
      }}
      onMouseLeave={(event) => {
        if (disabled) return;
        event.currentTarget.style.transform = 'translateY(0)';
        event.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 107, 157, 0.3)';
      }}
    >
      {props.children}
    </button>
  );
}

function GhostButton(props: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  const disabled = props.disabled === true;
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={disabled}
      style={{
        padding: '11px 20px',
        borderRadius: '20px',
        border: `2px solid ${props.danger ? '#ffc9c9' : '#ffd6e7'}`,
        background: props.danger ? '#fff1f1' : '#fff5f8',
        color: props.danger ? '#ff4757' : '#ff6b9d',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        fontWeight: 'bold',
        opacity: disabled ? 0.55 : 1,
        transition: 'all 0.3s ease'
      }}
      onMouseEnter={(event) => {
        if (disabled) return;
        event.currentTarget.style.background = props.danger ? '#ffe0e0' : '#ffe8f0';
      }}
      onMouseLeave={(event) => {
        if (disabled) return;
        event.currentTarget.style.background = props.danger ? '#fff1f1' : '#fff5f8';
      }}
    >
      {props.children}
    </button>
  );
}

function Overlay(props: { onClose: () => void; children: ReactNode }) {
  const { onClose } = props;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(event) => event.stopPropagation()}>
        {props.children}
      </div>
    </div>
  );
}

export default function ManageClient() {
  const [songs, setSongs] = useState<CloudSong[]>([]);
  const [quota, setQuota] = useState<Quota>({ usedBytes: 0, limitBytes: 0 });
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState('');

  const [pendingDelete, setPendingDelete] = useState<CloudSong | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const pendingSha = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const library = await readJson<Library>('/storage/data');
      setSongs(library.songs);
      setQuota(library.quota);
      setLoaded(true);
      setLoadError('');
    } catch (error) {
      setLoadError(describe(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (window.localStorage.getItem(ADMIN_KEY) === 'true') {
      setIsAdmin(true);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openLogin = () => {
    setShowLogin(true);
    setLoginPassword('');
    setLoginError('');
  };

  const submitLogin = () => {
    if (loginPassword === ADMIN_PASSWORD) {
      setIsAdmin(true);
      window.localStorage.setItem(ADMIN_KEY, 'true');
      setShowLogin(false);
      setLoginPassword('');
      setLoginError('');
      return;
    }
    setLoginError('密码错误');
  };

  const logout = () => {
    setIsAdmin(false);
    window.localStorage.removeItem(ADMIN_KEY);
    setTasks([]);
    setPendingDelete(null);
  };

  const updateTask = (id: string, patch: Partial<UploadTask>) => {
    setTasks((previous) => previous.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  };

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: UploadTask[] = [];
    const rejected: string[] = [];

    Array.from(files).forEach((file, index) => {
      const extension = (file.name.split('.').pop() ?? '').toLowerCase();
      const limit = FORMAT_LIMITS[extension];
      if (limit === undefined) {
        rejected.push(`${file.name}：不支持的格式 .${extension}`);
        return;
      }
      if (file.size > limit) {
        rejected.push(`${file.name}：上限 ${formatBytes(limit)}，实际 ${formatBytes(file.size)}`);
        return;
      }
      accepted.push({
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        name: file.name.replace(/\.[^.]+$/, ''),
        singers: '',
        phase: 'queued',
        progress: 0,
        message: '等待上传'
      });
    });

    if (accepted.length > 0) setTasks((previous) => [...previous, ...accepted]);
    if (rejected.length > 0) setToast(rejected.join('；'));
  };

  const removeTask = (id: string) => {
    setTasks((previous) => previous.filter((task) => task.id !== id));
  };

  const uploadOne = async (task: UploadTask, meta: { name: string; singers: string }, signal: AbortSignal) => {
    updateTask(task.id, { phase: 'hashing', progress: 0, message: '正在计算文件指纹' });
    const buffer = await task.file.arrayBuffer();
    const sha256 = toHex(await crypto.subtle.digest('SHA-256', buffer));
    signal.throwIfAborted();

    updateTask(task.id, { phase: 'uploading', progress: 0, message: '正在创建上传' });
    const created = await api<CreatedSong>(
      'POST',
      '/storage/upload',
      {
        name: meta.name,
        singers: meta.singers,
        fileName: task.file.name,
        byteSize: task.file.size,
        sha256
      },
      ADMIN_PASSWORD,
      signal
    );

    if (created.duplicated) {
      updateTask(task.id, { phase: 'duplicate', progress: 100, message: '云端已有这首歌' });
      return;
    }

    pendingSha.current = sha256;
    const total = created.chunkCount;
    const uploaded = new Set(created.uploadedChunks);

    for (let index = 0; index < total; index += 1) {
      if (uploaded.has(index)) {
        updateTask(task.id, { progress: Math.round(((index + 1) / total) * 100) });
        continue;
      }
      signal.throwIfAborted();
      const begin = index * CHUNK_SIZE;
      const slice = new Uint8Array(buffer.slice(begin, Math.min(begin + CHUNK_SIZE, buffer.byteLength)));
      const chunkSha256 = toHex(await crypto.subtle.digest('SHA-256', slice));
      updateTask(task.id, {
        progress: Math.round((index / total) * 100),
        message: `正在上传第 ${index + 1} / ${total} 块`
      });
      await api(
        'PUT',
        `/storage/upload/${sha256}/${index}`,
        { data: toBase64(slice), chunkSha256 },
        ADMIN_PASSWORD,
        signal
      );
      updateTask(task.id, { progress: Math.round(((index + 1) / total) * 100) });
    }

    updateTask(task.id, { message: '正在收尾' });
    await api('POST', `/storage/upload/${sha256}/complete`, {}, ADMIN_PASSWORD, signal);
    pendingSha.current = null;
    updateTask(task.id, { phase: 'done', progress: 100, message: '已上传' });
  };

  const startQueue = async () => {
    if (running) return;
    if (!isAdmin) {
      openLogin();
      return;
    }
    const pending = tasks.filter((task) => task.phase === 'queued' || task.phase === 'error');
    if (pending.length === 0) return;

    const missing = pending.filter((task) => task.singers.trim() === '');
    if (missing.length > 0) {
      setToast(`还有 ${missing.length} 首没填歌手`);
      return;
    }

    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);

    for (const task of pending) {
      if (controller.signal.aborted) break;
      const meta = { name: task.name.trim() || task.file.name, singers: task.singers.trim() };
      try {
        await uploadOne(task, meta, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) {
          updateTask(task.id, { phase: 'queued', progress: 0, message: '已停止' });
          break;
        }
        const message = describe(error);
        updateTask(task.id, { phase: 'error', message });
        setToast(message);
        break;
      }
    }

    abort.current = null;
    pendingSha.current = null;
    setRunning(false);
    await load();
  };

  const stopQueue = () => {
    abort.current?.abort();
    const sha256 = pendingSha.current;
    if (sha256 === null || !isAdmin) return;
    pendingSha.current = null;
    void api('DELETE', `/storage/upload/${sha256}`, undefined, ADMIN_PASSWORD, new AbortController().signal).catch(
      (error: unknown) => setToast(describe(error))
    );
  };

  const clearFinished = () => {
    setTasks((previous) => previous.filter((task) => task.phase !== 'done' && task.phase !== 'duplicate'));
  };

  const confirmDelete = async () => {
    const song = pendingDelete;
    if (song === null) return;
    if (!isAdmin) {
      setPendingDelete(null);
      openLogin();
      return;
    }
    setDeleting(true);
    try {
      await api('DELETE', `/storage/upload/${song.sha256}`, undefined, ADMIN_PASSWORD, new AbortController().signal);
      setPendingDelete(null);
      setToast(`已删除《${song.name}》`);
      await load();
    } catch (error) {
      setToast(describe(error));
    } finally {
      setDeleting(false);
    }
  };

  const keyword = search.trim().toLowerCase();
  const visibleSongs = songs.filter((song) => {
    if (!keyword) return true;
    if (song.name.toLowerCase().includes(keyword)) return true;
    return song.singers.some((singer) => singer.toLowerCase().includes(keyword));
  });

  const usedRatio = quota.limitBytes > 0 ? Math.min(100, (quota.usedBytes / quota.limitBytes) * 100) : 0;

  return (
    <div
      style={{ minHeight: '100vh', background: '#fff5f8' }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '16px' }}>
        <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={titleStyle}>🎵 云端曲库</h1>
            <span
              style={{
                color: '#ff6b9d',
                fontSize: '13px',
                background: '#ffe8f0',
                padding: '5px 12px',
                borderRadius: '12px',
                fontWeight: 'bold'
              }}
            >
              {`${songs.length} 首`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <a
              href="/"
              style={{
                color: '#ff6b9d',
                fontSize: '14px',
                fontWeight: 'bold',
                textDecoration: 'none',
                padding: '10px 12px'
              }}
            >
              歌单
            </a>
            <GhostButton onClick={() => void load()} disabled={loading}>
              {loading ? '刷新中' : '刷新'}
            </GhostButton>
            {isAdmin ? (
              <>
                <span
                  style={{
                    color: '#ff6b9d',
                    fontSize: '13px',
                    background: '#ffe8f0',
                    padding: '6px 12px',
                    borderRadius: '12px',
                    fontWeight: 'bold'
                  }}
                >
                  ✨ 已解锁
                </span>
                <GhostButton onClick={logout}>退出</GhostButton>
              </>
            ) : (
              <PrimaryButton onClick={openLogin}>编辑模式 🔐</PrimaryButton>
            )}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '12px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#93737b', marginBottom: '8px' }}>
            <span>{loaded ? `已用 ${formatBytes(quota.usedBytes)} / ${formatBytes(quota.limitBytes)}` : '正在读取配额'}</span>
            <span>{`相同内容的文件只存一份`}</span>
          </div>
          <div style={{ height: '8px', borderRadius: '999px', background: '#ffe3ee', overflow: 'hidden' }}>
            <div style={{ width: `${usedRatio}%`, height: '100%', background: 'linear-gradient(90deg, #ff6b9d, #ff8fab)' }} />
          </div>
        </div>

        {!isAdmin ? (
          <p style={{ ...hintStyle, margin: '0 0 16px', paddingLeft: '4px' }}>
            只读模式，点右上角的编辑模式登录后可以上传与删除。
          </p>
        ) : null}

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <h2 style={sectionTitleStyle}>上传</h2>
            <span style={hintStyle}>mp3 最大 100 MB，其他音频格式最大 20 MB</span>
          </div>

          <div
            onClick={() => {
              if (!isAdmin) {
                openLogin();
                return;
              }
              fileInput.current?.click();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (isAdmin) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!isAdmin) {
                openLogin();
                return;
              }
              addFiles(event.dataTransfer.files);
            }}
            style={{
              border: `2px dashed ${dragging ? '#ff6b9d' : '#ffd6e7'}`,
              borderRadius: '16px',
              background: dragging ? '#fff0f6' : '#fff8fb',
              padding: '26px 16px',
              textAlign: 'center',
              cursor: isAdmin ? 'pointer' : 'default',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ fontSize: '26px', lineHeight: 1 }}>🎧</div>
            <div style={{ marginTop: '8px', color: '#ff6b9d', fontWeight: 'bold', fontSize: '15px' }}>
              把音频拖到这里，或点击选择文件
            </div>
            <div style={{ ...hintStyle, marginTop: '4px' }}>可以一次选多首</div>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPT}
              style={{ display: 'none' }}
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </div>

          {tasks.length > 0 ? (
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    border: '1px solid #ffe3ee',
                    borderRadius: '14px',
                    padding: '10px 12px',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    background: '#ffffff'
                  }}
                >
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '14px',
                        color: '#3b282c',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {task.file.name}
                    </div>
                    <div style={{ ...hintStyle, marginTop: '2px' }}>
                      {`${formatBytes(task.file.size)} · ${task.message}`}
                    </div>
                    <div style={{ marginTop: '6px', height: '6px', borderRadius: '999px', background: '#ffe3ee', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${task.progress}%`,
                          height: '100%',
                          background: task.phase === 'error' ? '#ff4757' : '#ff6b9d',
                          transition: 'width 0.2s ease'
                        }}
                      />
                    </div>
                  </div>
                  <input
                    value={task.name}
                    onChange={(event) => updateTask(task.id, { name: event.target.value })}
                    placeholder="歌曲名称"
                    disabled={running || task.phase === 'done' || task.phase === 'duplicate'}
                    style={{ ...inputStyle, flex: '1 1 160px', minWidth: 0 }}
                  />
                  <input
                    value={task.singers}
                    onChange={(event) => updateTask(task.id, { singers: event.target.value })}
                    placeholder="歌手，用逗号分隔"
                    disabled={running || task.phase === 'done' || task.phase === 'duplicate'}
                    style={{ ...inputStyle, flex: '1 1 160px', minWidth: 0 }}
                  />
                  <button
                    type="button"
                    onClick={() => removeTask(task.id)}
                    disabled={running}
                    title="从队列移除"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#c9a3ae',
                      cursor: running ? 'not-allowed' : 'pointer',
                      fontSize: '18px',
                      lineHeight: 1,
                      padding: '6px'
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <PrimaryButton onClick={() => void startQueue()} disabled={!isAdmin || running}>
                  {running ? '上传中' : '开始上传'}
                </PrimaryButton>
                {running ? <GhostButton onClick={stopQueue}>停止</GhostButton> : null}
                {!running && tasks.length > 0 ? <GhostButton onClick={clearFinished}>清空已完成</GhostButton> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <h2 style={sectionTitleStyle}>云端文件</h2>
            <span style={hintStyle}>{`共 ${songs.length} 首`}</span>
            <div style={{ flex: 1 }} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索歌名或歌手"
              style={{ ...inputStyle, width: '220px', maxWidth: '100%' }}
            />
          </div>

          {loadError ? (
            <div
              style={{
                border: '1px solid #ffc9c9',
                background: '#fff1f1',
                borderRadius: '12px',
                padding: '12px 14px',
                color: '#ff4757',
                fontSize: '13px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap'
              }}
            >
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => void load()}
                style={{
                  border: 'none',
                  background: '#ff4757',
                  color: 'white',
                  borderRadius: '12px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                重试
              </button>
            </div>
          ) : null}

          {!loadError && loading && !loaded ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[0, 1, 2].map((row) => (
                <div key={row} style={{ height: '18px', borderRadius: '8px', background: '#ffeef5' }} />
              ))}
            </div>
          ) : null}

          {!loadError && loaded && visibleSongs.length === 0 ? (
            <p style={{ ...hintStyle, padding: '18px 0', textAlign: 'center' }}>
              {songs.length === 0 ? '云端还没有歌曲' : '没有匹配的歌曲'}
            </p>
          ) : null}

          {visibleSongs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {visibleSongs.map((song) => (
                <div
                  key={song.sha256}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 4px',
                    borderTop: '1px solid #ffeaf2',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 'bold',
                        color: '#3b282c',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {song.name}
                    </div>
                    <div style={{ ...hintStyle, marginTop: '2px' }}>{song.singers.join('、')}</div>
                  </div>
                  <div style={{ ...hintStyle, flex: '0 0 130px' }}>{`${song.format.toUpperCase()} · ${formatBytes(song.byteSize)}`}</div>
                  <div style={{ ...hintStyle, flex: '0 0 100px' }}>{formatDate(song.createdAt)}</div>
                  <GhostButton
                    danger
                    onClick={() => {
                      if (!isAdmin) {
                        openLogin();
                        return;
                      }
                      setPendingDelete(song);
                    }}
                    disabled={deleting}
                  >
                    删除
                  </GhostButton>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <p style={{ ...hintStyle, textAlign: 'center', padding: '8px 0 24px' }}>
          上传与删除会直接改动云端曲库，手机端下拉刷新即可看到。
        </p>
      </main>

      {showLogin ? (
        <Overlay onClose={() => setShowLogin(false)}>
          <h2 style={{ fontSize: '22px', marginBottom: '24px', color: '#ff6b9d', textAlign: 'center', fontWeight: 'bold' }}>
            请输入密码
          </h2>
          <input
            autoFocus
            type="password"
            placeholder="密码"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitLogin();
            }}
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: '20px',
              border: '2px solid #ffd6e7',
              fontSize: '16px',
              marginBottom: '16px',
              boxSizing: 'border-box',
              background: '#fff8fb',
              outline: 'none'
            }}
          />
          {loginError ? (
            <p
              style={{
                color: '#ff4757',
                fontSize: '14px',
                margin: '0 0 16px',
                textAlign: 'center',
                background: '#ffe0e0',
                padding: '8px',
                borderRadius: '8px'
              }}
            >
              {loginError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setShowLogin(false)}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '20px',
                border: '2px solid #ffd6e7',
                background: '#fff5f8',
                color: '#ff6b9d',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={submitLogin}
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
                boxShadow: '0 4px 12px rgba(255, 107, 157, 0.3)'
              }}
            >
              进入 ✨
            </button>
          </div>
        </Overlay>
      ) : null}

      {pendingDelete !== null ? (
        <Overlay onClose={() => setPendingDelete(null)}>
          <h2 style={{ fontSize: '20px', margin: '0 0 12px', color: '#ff6b9d', fontWeight: 'bold' }}>
            {`删除《${pendingDelete.name}》`}
          </h2>
          <p style={{ fontSize: '13px', color: '#93737b', lineHeight: 1.7, margin: '0 0 20px' }}>
            云端的分块会被移除，手机端已经下载的副本不受影响。删除后无法恢复。
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '20px',
                border: '2px solid #ffd6e7',
                background: '#fff5f8',
                color: '#ff6b9d',
                cursor: deleting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={deleting}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '20px',
                border: 'none',
                background: deleting ? '#ffb3bd' : '#ff4757',
                color: 'white',
                cursor: deleting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                boxShadow: deleting ? 'none' : '0 4px 12px rgba(255, 71, 87, 0.25)'
              }}
            >
              {deleting ? '删除中' : '删除'}
            </button>
          </div>
        </Overlay>
      ) : null}

      {toast ? (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: '24px',
            transform: 'translateX(-50%)',
            background: '#ffffff',
            border: '2px solid #ffd6e7',
            borderRadius: '16px',
            boxShadow: '0 8px 24px rgba(255, 107, 157, 0.2)',
            padding: '12px 18px',
            fontSize: '13px',
            color: '#3b282c',
            maxWidth: '90vw',
            zIndex: 1100
          }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
