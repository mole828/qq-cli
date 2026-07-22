import { readFile } from "node:fs/promises";
import type { ChatMessage, Contact } from "./types.js";

export interface SavedChatHistory {
  version: 1;
  capturedAt: string;
  contact: Contact;
  selfId: number;
  nickname: string;
  messages: ChatMessage[];
}

export async function readChatHistory(path: string): Promise<SavedChatHistory> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<SavedChatHistory>;
  if (
    parsed.version !== 1 ||
    !parsed.contact ||
    parsed.contact.type !== "group" && parsed.contact.type !== "friend" ||
    !Number.isFinite(parsed.contact.id) ||
    !Array.isArray(parsed.messages) ||
    !Number.isFinite(parsed.selfId)
  ) {
    throw new Error(`Invalid chat history file: ${path}`);
  }

  return parsed as SavedChatHistory;
}
