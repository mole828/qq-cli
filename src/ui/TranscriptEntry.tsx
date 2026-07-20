import React from "react";
import { Box, Text } from "ink";
import type { ImageMode } from "../config.js";
import { compactMessage, getImageSources } from "../message-format.js";
import { linkifyUrls } from "../terminal-text.js";
import type { ChatMessage } from "../types.js";
import { ImageStrip } from "./ImageStrip.js";

export interface TranscriptEntry {
  key: string;
  type: "message";
  message: ChatMessage;
}

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
  renderInlineImage?: boolean;
  imagePreviewHeight?: number;
}

export function TranscriptEntryView({
  entry,
  selfId,
  termWidth,
  imageMode,
  renderInlineImage = false,
  imagePreviewHeight,
}: TranscriptEntryViewProps) {
  const { message } = entry;
  const isMine = message.senderId === selfId || message.isMine;
  const sender = isMine ? "you" : message.senderName || String(message.senderId);
  const content = compactMessage(message, { imageMode, terminalLinks: true }) || "(empty)";
  const linkedContent = linkifyUrls(content);
  const imageSources = renderInlineImage && imageMode === "inline"
    ? getImageSources(message)
    : [];
  const stripWidth = Math.max(termWidth - 4, 1);

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
          {linkedContent}
        </Text>
        {imageSources.length > 0 && (
          <ImageStrip
            sources={imageSources}
            width={stripWidth}
            height={imagePreviewHeight ?? 10}
          />
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} marginBottom={1}>
      <Text>
        <Text>{sender}</Text>
        <Text dimColor> · {formatTime(message.timestamp)}</Text>
      </Text>
      <Text wrap="wrap">{linkedContent}</Text>
      {imageSources.length > 0 && (
        <ImageStrip
          sources={imageSources}
          width={stripWidth}
          height={imagePreviewHeight ?? 10}
        />
      )}
    </Box>
  );
}
