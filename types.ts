
export interface ChatMessage {
  role: 'anonymous' | 'owner';
  content: string;
  timestamp: number;
}

export interface Message {
  id: string;
  recipientId: string;
  content: string;
  timestamp: number;
  read: boolean;
  vibe?: string;
  vibeAnalysis?: string;
  replies?: ChatMessage[];
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
}

export type AppView = 'LANDING' | 'INBOX' | 'SENDER_VIEW' | 'SETTINGS';
