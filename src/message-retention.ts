import type { ChatMessage } from "./types.js";

export const MAX_MESSAGES_PER_SESSION = 500;

// Input is in transcript order; each session keeps its latest entries independently.
export function retainSessionMessages(
  messages: ChatMessage[],
  limit = MAX_MESSAGES_PER_SESSION
): { messages: ChatMessage[]; removed: ChatMessage[] } {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("Message retention limit must be a positive integer");
  }
  const counts = new Map<string, number>();
  const retained: ChatMessage[] = [];
  const removed: ChatMessage[] = [];
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    const key = `${message.chatType}:${message.contactId}`;
    const count = counts.get(key) ?? 0;
    if (count >= limit) removed.push(message);
    else {
      counts.set(key, count + 1);
      retained.push(message);
    }
  }
  return {
    messages: removed.length ? retained.reverse() : messages,
    removed,
  };
}
