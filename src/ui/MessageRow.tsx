import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage, Contact, ImageSourceResolver } from "../types.js";
import type { ImageMode } from "../config.js";
import { compactMessage, getImageReferences } from "../message-format.js";
import {
  linkifyUrls,
  singleLine,
  textWidth,
  truncateCells,
  wrapCells,
} from "../terminal-text.js";
import { ImageStrip } from "./ImageStrip.js";

const MAX_BODY_LINES = 3;

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
  imagePreviewHeight: number;
  imageMode: ImageMode;
  renderInlineImage: boolean;
  messageGap: number;
  cropTop?: number;
  visibleRows?: number;
  clipped?: boolean;
  replyLookup?: ReadonlyMap<string, ChatMessage>;
  resolveImageSource?: ImageSourceResolver;
}

export function MessageRow({
  msg,
  index,
  selfId,
  termWidth,
  imagePreviewHeight,
  imageMode,
  renderInlineImage,
  messageGap,
  cropTop = 0,
  visibleRows,
  clipped = false,
  replyLookup,
  resolveImageSource,
}: MessageRowProps) {
  const isMine = msg.senderId === selfId;
  const time = formatTime(msg.timestamp);
  const sender = isMine ? "you" : msg.senderName || String(msg.senderId);
  const rowWidth = Math.max(termWidth - 2, 12);
  const rawContent = compactMessage(msg, { imageMode, replyLookup });
  const linkedContent =
    compactMessage(msg, { imageMode, terminalLinks: true, replyLookup }) || "(empty)";
  const imageReferences =
    imageMode === "inline" && renderInlineImage ? getImageReferences(msg) : [];

  if (isMine) {
    const promptBg = "#3a3a3a";
    const promptWidth = Math.max(rowWidth - 4, 8);
    const contentLines = wrapCells(
      rawContent || "(empty)",
      promptWidth,
      MAX_BODY_LINES
    );
    const renderLines = contentLines.length === 1
      ? [singleLine(linkedContent)]
      : contentLines.map((line) => linkifyUrls(line));

    const row = (
      <Box
        key={`${msg.id}-${index}`}
        flexDirection="column"
        overflow="hidden"
        marginBottom={messageGap}
      >
        <Box
          flexDirection="column"
          marginX={1}
          paddingX={1}
          overflow="hidden"
          backgroundColor={promptBg}
          width={rowWidth}
        >
          {renderLines.map((line, lineIndex) => (
            <Text
              key={lineIndex}
              color="white"
              backgroundColor={promptBg}
              wrap="truncate-end"
            >
              <Text bold>{lineIndex === 0 ? "› " : "  "}</Text>
              {line}
            </Text>
          ))}
        </Box>
        {imageReferences.length > 0 && (
          <Box paddingLeft={4} height={imagePreviewHeight} overflow="hidden">
            <ImageStrip
              references={imageReferences}
              width={Math.max(rowWidth - 4, 1)}
              height={imagePreviewHeight}
              clipped={clipped}
              resolveSource={resolveImageSource}
            />
          </Box>
        )}
      </Box>
    );

    return clipRow(row, cropTop, visibleRows);
  }

  const messageIdLabel = `#${String(msg.id)}`;
  const senderWidth = Math.max(
    Math.min(Math.floor(termWidth * 0.32), 28) - textWidth(messageIdLabel) - 1,
    8
  );
  const senderLabel = truncateCells(sender, senderWidth);
  const bodyWidth = Math.max(termWidth - 8, 16);
  const contentLines = wrapCells(
    rawContent || "(empty)",
    bodyWidth,
    MAX_BODY_LINES
  );
  const renderLines = contentLines.length === 1
    ? [singleLine(linkedContent)]
    : contentLines.map((line) => linkifyUrls(line));

  const row = (
    <Box
      key={`${msg.id}-${index}`}
      flexDirection="column"
      overflow="hidden"
      paddingX={2}
      marginBottom={messageGap}
    >
      <Box flexDirection="row" height={1} overflow="hidden">
        <Box width={2} flexShrink={0}>
          <Text dimColor>•</Text>
        </Box>
        <Text color="white" bold wrap="truncate-end">
          <Text color="cyan" dimColor>{messageIdLabel}</Text>
          <Text> {senderLabel}</Text>
          <Text dimColor> · {time}</Text>
        </Text>
      </Box>
      <Box flexDirection="column" paddingLeft={2} overflow="hidden">
        {renderLines.map((line, lineIndex) => (
          <Text key={lineIndex} color="white" wrap="truncate-end">
            {line}
          </Text>
        ))}
      </Box>
      {imageReferences.length > 0 && (
        <Box paddingLeft={2} height={imagePreviewHeight} overflow="hidden">
          <ImageStrip
            references={imageReferences}
            width={Math.max(termWidth - 6, 1)}
            height={imagePreviewHeight}
            clipped={clipped}
            resolveSource={resolveImageSource}
          />
        </Box>
      )}
    </Box>
  );

  return clipRow(row, cropTop, visibleRows);
}

function clipRow(
  row: React.ReactElement,
  cropTop: number,
  visibleRows: number | undefined
) {
  if (cropTop <= 0 && visibleRows === undefined) return row;

  return (
    <Box height={Math.max(visibleRows ?? 1, 1)} overflow="hidden">
      <Box flexDirection="column" marginTop={-Math.max(cropTop, 0)}>
        {row}
      </Box>
    </Box>
  );
}
