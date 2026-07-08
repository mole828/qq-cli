import React from "react";
import { Box, Text } from "ink";
import type { ImageMode } from "../config.js";
import { compactMessage } from "../message-format.js";
import type { ChatMessage, Contact } from "../types.js";
import { textWidth, truncateCells } from "../terminal-text.js";

export type TranscriptEntry =
  | {
      key: string;
      type: "resume";
      session: Contact;
      historyCount: number;
    }
  | {
      key: string;
      type: "message";
      message: ChatMessage;
    };

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

interface TranscriptEntryViewProps {
  entry: TranscriptEntry;
  selfId: number;
  termWidth: number;
  imageMode: ImageMode;
}

export function TranscriptEntryView({
  entry,
  selfId,
  termWidth,
  imageMode,
}: TranscriptEntryViewProps) {
  if (entry.type === "resume") {
    const kind = entry.session.type === "group" ? "channel" : "direct";
    const label = `─ resumed · ${kind}:${entry.session.name} · ${entry.historyCount} history messages `;
    const clipped = truncateCells(label, Math.max(termWidth - 2, 12));

    return (
      <Box paddingX={1} marginBottom={1}>
        <Text dimColor>
          {clipped}
          {"─".repeat(Math.max(termWidth - 2 - textWidth(clipped), 0))}
        </Text>
      </Box>
    );
  }

  const { message } = entry;
  const isMine = message.senderId === selfId || message.isMine;
  const sender = isMine ? "you" : message.senderName || String(message.senderId);
  const content = compactMessage(message, { imageMode }) || "(empty)";

  if (isMine) {
    return (
      <Box
        flexDirection="column"
        marginX={1}
        marginBottom={1}
        paddingX={1}
        width={Math.max(termWidth - 2, 12)}
        backgroundColor="#3a3a3a"
      >
        <Text backgroundColor="#3a3a3a" wrap="wrap">
          <Text bold>› </Text>
          {content}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} marginBottom={1}>
      <Text>
        <Text>{sender}</Text>
        <Text dimColor> · {formatTime(message.timestamp)}</Text>
      </Text>
      <Text wrap="wrap">{content}</Text>
    </Box>
  );
}
