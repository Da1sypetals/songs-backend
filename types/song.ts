export type EnsembleType = 'none' | 'duet' | 'chorus';

export interface Song {
  id: string;
  name: string;
  singers: string[];
  tags: string[];
  key: number | null;  // null = 未定调, 0 = 原调, >0 = 升调, <0 = 降调
  notes?: string;
  featured?: boolean;
  ensembleType?: EnsembleType;
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
