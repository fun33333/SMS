export interface Actor {
  id: number;
  name: string;
  email: string;
}

export interface Notification {
  id: number;
  recipient: number;
  actor?: Actor;
  verb: string;
  target_text: string;
  data: Record<string, any>;
  unread: boolean;
  timestamp: string;
}