import React from "react";
import type { ChatMessage, Contact } from "../types.js";
import type { ImageMode } from "../config.js";
import { compactMessage, getFirstImageSource } from "../message-format.js";
import { wrapCells } from "../terminal-text.js";
import { IMAGE_PREVIEW_HEIGHT } from "./ImagePreview.js";
import { MessageRow } from "./MessageRow.js";

const MAX_BODY_LINES = 3;
const INLINE_IMAGE_ROW_COST = IMAGE_PREVIEW_HEIGHT;

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
  bodyRows: number;
  imageMode: ImageMode;
  scrollOffset: number;
  messageGap: number;
}

function getMessageRowCost(
  msg: ChatMessage,
  selfId: number,
  termWidth: number,
  imageMode: ImageMode,
  canRenderInlineImages: boolean,
  messageGap: number
) {
  const isMine = msg.senderId === selfId || msg.isMine;
  const textWidth = Math.max(termWidth - (isMine ? 6 : 8), 16);
  const lineCount = wrapCells(
    compactMessage(msg, { imageMode }) || "(empty)",
    textWidth,
    MAX_BODY_LINES
  ).length;
  const textRows = (isMine ? lineCount : lineCount + 1) + messageGap;
  if (imageMode !== "inline" || !canRenderInlineImages) return textRows;
  return getFirstImageSource(msg) ? textRows + INLINE_IMAGE_ROW_COST : textRows;
}

export function getMessageScrollRows(
  msg: ChatMessage,
  bodyRows: number,
  selfId: number,
  termWidth: number,
  imageMode: ImageMode,
  messageGap: number
) {
  return getMessageRowCost(
    msg,
    selfId,
    termWidth,
    imageMode,
    bodyRows >= INLINE_IMAGE_ROW_COST,
    messageGap
  );
}

export function moveMessageScrollOffset(
  messages: ChatMessage[],
  bodyRows: number,
  selfId: number,
  termWidth: number,
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
  imageMode: ImageMode,
  messageGap: number
) {
  const canRenderInlineImages = bodyRows >= INLINE_IMAGE_ROW_COST;
  const totalRows = messages.reduce(
    (sum, msg) =>
      sum +
      getMessageRowCost(
        msg,
        selfId,
        termWidth,
        imageMode,
        canRenderInlineImages,
        messageGap
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
  imageMode: ImageMode,
  canRenderInlineImages: boolean,
  messageGap: number,
  scrollOffset: number
) {
  const rowCosts = messages.map((msg) =>
    getMessageRowCost(
      msg,
      selfId,
      termWidth,
      imageMode,
      canRenderInlineImages,
      messageGap
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
  bodyRows,
  imageMode,
  messageGap,
  scrollOffset,
}: MessageListProps) {
  const canRenderInlineImages = bodyRows >= INLINE_IMAGE_ROW_COST;
  const visibleMsgs = getVisibleMessages(
    messages,
    bodyRows,
    selfId,
    termWidth,
    imageMode,
    canRenderInlineImages,
    messageGap,
    scrollOffset
  );

  return (
    <>
      {visibleMsgs.map(({ msg, cropTop, visibleRows, clipped }, i) => (
        <MessageRow
          key={`${msg.id}-${i}`}
          msg={msg}
          index={i}
          selfId={selfId}
          activeSession={activeSession}
          termWidth={termWidth}
          imageMode={imageMode}
          renderInlineImage={canRenderInlineImages}
          messageGap={messageGap}
          cropTop={cropTop}
          visibleRows={visibleRows}
          clipped={clipped}
        />
      ))}
    </>
  );
}
