import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage, Contact } from "../types.js";
import type { ImageMode } from "../config.js";
import { compactMessage, getFirstImageSource } from "../message-format.js";
import { linkifyUrls, truncateCells } from "../terminal-text.js";
import { ImagePreview } from "./ImagePreview.js";

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
  imageMode: ImageMode;
  renderInlineImage: boolean;
}

export function MessageRow({
  msg,
  index,
  selfId,
  activeSession,
  termWidth,
  imageMode,
  renderInlineImage,
}: MessageRowProps) {
  const isMine = msg.senderId === selfId;
  const time = formatTime(msg.timestamp);
  const sender = isMine ? "you" : msg.senderName || String(msg.senderId);
  const nameWidth = activeSession?.type === "group" ? 12 : 10;
  const contentWidth = Math.max(termWidth - nameWidth - 17, 16);
  const content = linkifyUrls(
    compactMessage(msg, { imageMode, terminalLinks: true })
  );
  const imageSource =
    imageMode === "inline" && renderInlineImage ? getFirstImageSource(msg) : null;

  return (
    <Box key={`${msg.id}-${index}`} flexDirection="column" overflow="hidden">
      <Box flexDirection="row" paddingX={2} height={1} overflow="hidden">
        <Box width={2}>
          <Text color="green">{isMine ? "•" : " "}</Text>
        </Box>
        <Box width={7}>
          <Text dimColor>{time}</Text>
        </Box>
        <Box width={nameWidth + 1}>
          <Text color={isMine ? "green" : "white"} wrap="truncate-end">
            {truncateCells(sender, nameWidth)}
          </Text>
        </Box>
        <Box width={contentWidth}>
          <Text color="white" wrap="truncate-end">
            {content || "(empty)"}
          </Text>
        </Box>
      </Box>
      {imageSource && (
        <Box paddingLeft={nameWidth + 12} height={10} overflow="hidden">
          <ImagePreview source={imageSource} />
        </Box>
      )}
    </Box>
  );
}
