import React from "react";
import type { ChatMessage, Contact, ImageSourceResolver } from "../types.js";
import type { ImageMode } from "../config.js";
import { compactMessage, getImageSources } from "../message-format.js";
import { wrapCells } from "../terminal-text.js";
import {
  getImagePreviewHeight,
  IMAGE_PREVIEW_HEIGHT,
} from "./ImagePreview.js";
import { MessageRow } from "./MessageRow.js";

const MAX_BODY_LINES = 3;
const INLINE_IMAGE_ROW_COST = IMAGE_PREVIEW_HEIGHT;

function getImageStripHeight(
  sources: string[],
  cellWidth: number,
  cellHeight: number
) {
  return sources.reduce(
    (height, source) =>
      Math.max(height, getImagePreviewHeight(source, cellWidth, cellHeight)),
    0
  );
}

function buildReplyLookup(messages: ChatMessage[]) {
  return new Map(messages.map((message) => [String(message.id), message]));
}

interface VisibleMessage {
  msg: ChatMessage;
  cropTop: number;
  visibleRows: number;
  clipped: boolean;
}

interface MessageListProps {
  messages: ChatMessage[];
  selfId: number;
  activeSession: Contact | null;
  termWidth: number;
  cellWidth: number;
  cellHeight: number;
  bodyRows: number;
  imageMode: ImageMode;
  scrollOffset: number;
  messageGap: number;
  resolveImageSource?: ImageSourceResolver;
}

function getMessageRowCost(
  msg: ChatMessage,
  selfId: number,
  termWidth: number,
  cellWidth: number,
  cellHeight: number,
  imageMode: ImageMode,
  canRenderInlineImages: boolean,
  messageGap: number,
  replyLookup?: ReadonlyMap<string, ChatMessage>
) {
  const isMine = msg.senderId === selfId || msg.isMine;
  const textWidth = Math.max(termWidth - (isMine ? 6 : 8), 16);
  const lineCount = wrapCells(
    compactMessage(msg, { imageMode, replyLookup }) || "(empty)",
    textWidth,
    MAX_BODY_LINES
  ).length;
  const textRows = (isMine ? lineCount : lineCount + 1) + messageGap;
  if (imageMode !== "inline" || !canRenderInlineImages) return textRows;
  const imageSources = getImageSources(msg);
  return imageSources.length > 0
    ? textRows + getImageStripHeight(imageSources, cellWidth, cellHeight)
    : textRows;
}

export function getMessageScrollRows(
  msg: ChatMessage,
  bodyRows: number,
  selfId: number,
  termWidth: number,
  cellWidth: number,
  cellHeight: number,
  imageMode: ImageMode,
  messageGap: number,
  messages: ChatMessage[] = [msg]
) {
  return getMessageRowCost(
    msg,
    selfId,
    termWidth,
    cellWidth,
    cellHeight,
    imageMode,
    bodyRows >= INLINE_IMAGE_ROW_COST,
    messageGap,
    buildReplyLookup(messages)
  );
}

export function moveMessageScrollOffset(
  messages: ChatMessage[],
  bodyRows: number,
  selfId: number,
  termWidth: number,
  cellWidth: number,
  cellHeight: number,
  imageMode: ImageMode,
  messageGap: number,
  currentOffset: number,
  direction: "older" | "newer"
) {
  const targetRows = Math.max(Math.floor(bodyRows / 2), 1);
  const maxOffset = getMaxMessageScrollOffset(
    messages,
    bodyRows,
    selfId,
    termWidth,
    cellWidth,
    cellHeight,
    imageMode,
    messageGap
  );
  const delta = direction === "older" ? targetRows : -targetRows;
  return clampOffset(currentOffset + delta, maxOffset);
}

function clampOffset(value: number, max: number) {
  return Math.min(Math.max(value, 0), max);
}

export function getMaxMessageScrollOffset(
  messages: ChatMessage[],
  bodyRows: number,
  selfId: number,
  termWidth: number,
  cellWidth: number,
  cellHeight: number,
  imageMode: ImageMode,
  messageGap: number
) {
  const canRenderInlineImages = bodyRows >= INLINE_IMAGE_ROW_COST;
  const replyLookup = buildReplyLookup(messages);
  const totalRows = messages.reduce(
    (sum, msg) =>
      sum +
      getMessageRowCost(
        msg,
        selfId,
        termWidth,
        cellWidth,
        cellHeight,
        imageMode,
        canRenderInlineImages,
        messageGap,
        replyLookup
      ),
    0
  );

  return Math.max(totalRows - bodyRows, 0);
}

function getVisibleMessages(
  messages: ChatMessage[],
  bodyRows: number,
  selfId: number,
  termWidth: number,
  cellWidth: number,
  cellHeight: number,
  imageMode: ImageMode,
  canRenderInlineImages: boolean,
  messageGap: number,
  scrollOffset: number
) {
  const replyLookup = buildReplyLookup(messages);
  const rowCosts = messages.map((msg) =>
    getMessageRowCost(
      msg,
      selfId,
      termWidth,
      cellWidth,
      cellHeight,
      imageMode,
      canRenderInlineImages,
      messageGap,
      replyLookup
    )
  );
  const totalRows = rowCosts.reduce((sum, rows) => sum + rows, 0);
  const viewportStart = clampOffset(totalRows - bodyRows - scrollOffset, totalRows);
  const viewportEnd = Math.min(viewportStart + bodyRows, totalRows);
  const selected: VisibleMessage[] = [];
  let rowCursor = 0;

  for (let i = 0; i < messages.length; i++) {
    const rowCost = rowCosts[i];
    const rowStart = rowCursor;
    const rowEnd = rowStart + rowCost;
    rowCursor = rowEnd;

    if (rowEnd <= viewportStart) continue;
    if (rowStart >= viewportEnd) break;

    const visibleStart = Math.max(rowStart, viewportStart);
    const visibleEnd = Math.min(rowEnd, viewportEnd);
    selected.push({
      msg: messages[i],
      cropTop: visibleStart - rowStart,
      visibleRows: visibleEnd - visibleStart,
      clipped: visibleStart > rowStart || visibleEnd < rowEnd,
    });
  }

  return selected;
}

export function MessageList({
  messages,
  selfId,
  activeSession,
  termWidth,
  cellWidth,
  cellHeight,
  bodyRows,
  imageMode,
  messageGap,
  scrollOffset,
  resolveImageSource,
}: MessageListProps) {
  const canRenderInlineImages = bodyRows >= INLINE_IMAGE_ROW_COST;
  const replyLookup = buildReplyLookup(messages);
  const visibleMsgs = getVisibleMessages(
    messages,
    bodyRows,
    selfId,
    termWidth,
    cellWidth,
    cellHeight,
    imageMode,
    canRenderInlineImages,
    messageGap,
    scrollOffset
  );

  return (
    <>
      {visibleMsgs.map(({ msg, cropTop, visibleRows, clipped }, i) => (
        <MessageRow
          key={`${msg.chatType}:${msg.contactId}:${msg.id}`}
          msg={msg}
          index={i}
          selfId={selfId}
          activeSession={activeSession}
          termWidth={termWidth}
          imagePreviewHeight={getImageStripHeight(
            getImageSources(msg),
            cellWidth,
            cellHeight
          ) || IMAGE_PREVIEW_HEIGHT}
          imageMode={imageMode}
          renderInlineImage={canRenderInlineImages}
          messageGap={messageGap}
          cropTop={cropTop}
          visibleRows={visibleRows}
          clipped={clipped}
          replyLookup={replyLookup}
          resolveImageSource={resolveImageSource}
        />
      ))}
    </>
  );
}
