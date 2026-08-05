import type { ChatMessage, MessageSegment } from "./types.js";

export const ECHO_RECENT_MESSAGE_LIMIT = 10;

export interface EchoCandidate {
  message: ChatMessage;
  count: number;
}

function echoKey(message: ChatMessage): string | null {
  if (message.content.length > 0) return `content:${message.content}`;
  if (message.segments?.length) {
    return `segments:${JSON.stringify(message.segments)}`;
  }
  return null;
}

export function findEchoCandidate(
  messages: readonly ChatMessage[],
  groupId: number,
  limit = ECHO_RECENT_MESSAGE_LIMIT
): EchoCandidate | null {
  const recentLimit = Number.isFinite(limit) ? Math.max(Math.floor(limit), 0) : 0;
  if (recentLimit === 0) return null;

  const recent = messages
    .filter((message) => message.chatType === "group" && message.contactId === groupId)
    .slice(-recentLimit);
  const counts = new Map<string, EchoCandidate>();

  for (const message of recent) {
    const key = echoKey(message);
    if (!key) continue;
    const previous = counts.get(key);
    counts.set(key, {
      message,
      count: (previous?.count || 0) + 1,
    });
  }

  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const message = recent[index];
    const key = echoKey(message);
    const candidate = key ? counts.get(key) : undefined;
    if (candidate && candidate.count >= 2) return candidate;
  }

  return null;
}

export function cloneEchoContent(
  message: ChatMessage
): string | MessageSegment[] | null {
  if (message.segments?.length) {
    return message.segments.map((segment) => ({
      ...segment,
      data: { ...segment.data },
    }));
  }
  return message.content.length > 0 ? message.content : null;
}
