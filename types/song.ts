export type EnsembleType = 'none' | 'duet' | 'chorus';

export interface SongAudioMeta {
  fileName: string;
  contentType: 'audio/mpeg';
  byteSize: number;
  durationSeconds: number;
  updatedAt: string;
  objectKey?: string;
}

export interface SongAudioRecord extends SongAudioMeta {
  base64: string;
}

export interface Song {
  id: string;
  name: string;
  singers: string[];
  tags: string[];
  key: number | null;  // null = 未定调, 0 = 原调, >0 = 升调, <0 = 降调
  notes?: string;
  featured?: boolean;
  ensembleType?: EnsembleType;
  hasAudio?: boolean;
  audioMeta?: SongAudioMeta;
  createdAt: string;
}

export interface CreateSongRequest {
  name: string;
  singers: string[];
  tags: string[];
  key: number | null;  // null = 未定调, 0 = 原调, >0 = 升调, <0 = 降调
  notes?: string;
  featured?: boolean;
  ensembleType: EnsembleType;
}

export type SongMap = Record<string, Song>;
