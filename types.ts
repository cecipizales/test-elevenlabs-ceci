export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export enum CallState {
  IDLE = 'IDLE',
  DIALING = 'DIALING',
  AI_SPEAKING = 'AI_SPEAKING',
  USER_SPEAKING = 'USER_SPEAKING',
  REPLY_READY = 'REPLY_READY',
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

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
}