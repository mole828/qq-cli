export interface OneBotMessageEvent {
  time: number;
  self_id: number;
  post_type: "message" | "message_sent";
  message_type: "private" | "group";
  sub_type: string;
  message_id: number | string;
  user_id: number | string;
  message: MessageSegment[];
  raw_message: string;
  font: number;
  sender: Sender;
  group_id?: number | string;
  target_id?: number | string;
  anonymous?: AnonymousInfo | null;
  message_seq?: number;
}

export interface Sender {
  user_id: number;
  nickname: string;
  sex?: string;
  age?: number;
  card?: string;
  area?: string;
  level?: string;
  role?: string;
  title?: string;
}

export interface AnonymousInfo {
  id: number;
  name: string;
  flag: string;
}

export interface MessageSegment {
  type: "text" | "image" | "record" | "video" | "at" | "face" | "reply" | "forward" | string;
  data: Record<string, unknown>;
}

export interface StickerItem {
  id: string;
  file: string;
  source: "custom";
}

export interface ImageReference {
  source: string;
  file?: string;
}

export type ImageSourceResolver = (file: string) => Promise<string | null>;

export interface ForwardNode {
  senderId?: string;
  senderName: string;
  timestamp?: number;
  segments: MessageSegment[];
}

export interface OneBotApiRequest {
  action: string;
  params?: Record<string, unknown>;
  echo?: string;
}

export interface OneBotApiResponse {
  status: "ok" | "failed" | "async";
  retcode: number;
  data: unknown;
  echo?: string;
}

export interface Contact {
  id: number;
  name: string;
  type: "friend" | "group";
  group_id?: number;
  remark?: string;
}

export interface ChatMessage {
  id: number | string;
  contactId: number;
  chatType: "private" | "group";
  senderId: number;
  senderName: string;
  content: string;
  timestamp: number;
  isMine: boolean;
  group_id?: number;
  segments?: MessageSegment[];
}

export interface ReplyTarget {
  sessionKey: string;
  messageId: string;
  senderName: string;
  preview: string;
}
