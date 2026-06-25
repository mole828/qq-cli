import React from "react";
import type { ChatMessage, Contact } from "../types.js";
import { MAX_MESSAGES } from "./layout.js";
import { MessageRow } from "./MessageRow.js";

interface MessageListProps {
  messages: ChatMessage[];
  selfId: number;
  activeSession: Contact | null;
  termWidth: number;
  bodyRows: number;
  expandImages: boolean;
}

export function MessageList({
  messages,
  selfId,
  activeSession,
  termWidth,
  bodyRows,
  expandImages,
}: MessageListProps) {
  const visibleMsgs = messages.slice(-MAX_MESSAGES).slice(-bodyRows);

  return (
    <>
      {visibleMsgs.map((msg, i) => (
        <MessageRow
          key={`${msg.id}-${i}`}
          msg={msg}
          index={i}
          selfId={selfId}
          activeSession={activeSession}
          termWidth={termWidth}
          expandImages={expandImages}
        />
      ))}
    </>
  );
}
