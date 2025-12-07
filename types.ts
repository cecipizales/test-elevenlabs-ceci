export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export enum MusicGenre {
  LOFI = 'lofi',
  CLASSICAL = 'classical',
  JAZZ = 'jazz',
  AMBIENT = 'ambient',
  NONE = 'none',
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
}

export interface TimerState {
  isActive: boolean;
  timeLeft: number; // in seconds
  duration: number; // in seconds (total for this session)
  mode: 'focus' | 'break';
}

export interface RadioState {
  isMuted: boolean;
  currentTrack: string | null;
  volume: number;
}