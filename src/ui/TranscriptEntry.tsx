import React from "react";
import { Box, Text } from "ink";
import type { ImageMode } from "../config.js";
import { compactMessage, getFirstImageSource } from "../message-format.js";
import type { ChatMessage } from "../types.js";
import { ImagePreview } from "./ImagePreview.js";

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
  const content = compactMessage(message, { imageMode }) || "(empty)";
  const imageSource = renderInlineImage && imageMode === "inline"
    ? getFirstImageSource(message)
    : null;

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
        {imageSource && (
          <ImagePreview source={imageSource} height={imagePreviewHeight} />
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
      <Text wrap="wrap">{content}</Text>
      {imageSource && (
        <ImagePreview source={imageSource} height={imagePreviewHeight} />
      )}
    </Box>
  );
}
