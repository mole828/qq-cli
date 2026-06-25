import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage, Contact } from "../types.js";
import { compactMessage } from "../message-format.js";
import { truncateCells } from "../terminal-text.js";

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

interface MessageRowProps {
  msg: ChatMessage;
  index: number;
  selfId: number;
  activeSession: Contact | null;
  termWidth: number;
  expandImages: boolean;
}

export function MessageRow({
  msg,
  index,
  selfId,
  activeSession,
  termWidth,
  expandImages,
}: MessageRowProps) {
  const isMine = msg.senderId === selfId;
  const time = formatTime(msg.timestamp);
  const sender = isMine ? "you" : msg.senderName || String(msg.senderId);
  const nameWidth = activeSession?.type === "group" ? 16 : 10;
  const contentWidth = Math.max(termWidth - nameWidth - 15, 16);
  const content = compactMessage(msg, { expandImages });

  return (
    <Box
      key={`${msg.id}-${index}`}
      flexDirection="row"
      paddingX={1}
      height={1}
      overflow="hidden"
    >
      <Box width={2}>
        <Text color={isMine ? "green" : "gray"}>{isMine ? "•" : "·"}</Text>
      </Box>
      <Box width={7}>
        <Text dimColor>{time}</Text>
      </Box>
      <Box width={nameWidth + 1}>
        <Text color={isMine ? "green" : "cyan"} wrap="truncate-end">
          {truncateCells(sender, nameWidth)}
        </Text>
      </Box>
      <Box width={contentWidth}>
        <Text color="white" wrap="truncate-end">
          {truncateCells(content || "(empty)", contentWidth)}
        </Text>
      </Box>
    </Box>
  );
}
