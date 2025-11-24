export interface Actor {
  id: number;
  name: string;
  email: string;
}

export interface Notification {
  id: number;
  recipient: number;
  actor?: Actor;
  actor_name?: string;
  verb: string;
  target_text: string;
  data: Record<string, any>;
  unread: boolean;
  timestamp: string;
}

export interface DeleteLog {
  id: number;
  feature: string;
  feature_display: string;
  action: string;
  action_display: string;
  entity_type: string;
  entity_id: number;
  entity_name: string;
  user: number | null;
  user_name: string;
  user_role: string | null;
  timestamp: string;
  ip_address: string | null;
  changes: Record<string, any>;
  reason: string;
}