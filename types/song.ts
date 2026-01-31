export interface Song {
  id: string;
  name: string;
  singers: string[];
  tags: string[];
  key: number;
  createdAt: string;
}

export interface CreateSongRequest {
  name: string;
  singers: string[];
  tags: string[];
  key: number;
}
