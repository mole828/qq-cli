import React from "react";
import type { ChatMessage, Contact } from "../types.js";
import type { ImageMode } from "../config.js";
import { compactMessage, getFirstImageSource } from "../message-format.js";
import { wrapCells } from "../terminal-text.js";
import { IMAGE_PREVIEW_HEIGHT } from "./ImagePreview.js";
import { MessageRow } from "./MessageRow.js";

const MAX_BODY_LINES = 3;
const INLINE_IMAGE_ROW_COST = IMAGE_PREVIEW_HEIGHT;

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
  const canRenderInlineImages = bodyRows >= INLINE_IMAGE_ROW_COST;
  const targetRows = Math.max(Math.floor(bodyRows / 2), 1);
  const maxOffset = getMaxMessageScrollOffset(
    messages,
    bodyRows,
    selfId,
    termWidth,
    imageMode,
    messageGap
  );
  let nextOffset = currentOffset;
  let movedRows = 0;

  if (direction === "older") {
    for (
      let i = messages.length - currentOffset - 1;
      i >= 0 && nextOffset < maxOffset && movedRows < targetRows;
      i--
    ) {
      movedRows += getMessageRowCost(
        messages[i],
        selfId,
        termWidth,
        imageMode,
        canRenderInlineImages,
        messageGap
      );
      nextOffset += 1;
    }
  } else {
    for (
      let i = messages.length - currentOffset;
      i < messages.length && nextOffset > 0 && movedRows < targetRows;
      i++
    ) {
      movedRows += getMessageRowCost(
        messages[i],
        selfId,
        termWidth,
        imageMode,
        canRenderInlineImages,
        messageGap
      );
      nextOffset -= 1;
    }
  }

  return clampOffset(nextOffset, maxOffset);
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
  let usedRows = 0;
  let firstViewportEnd = 0;

  for (const msg of messages) {
    const rowCost = getMessageRowCost(
      msg,
      selfId,
      termWidth,
      imageMode,
      canRenderInlineImages,
      messageGap
    );
    if (firstViewportEnd > 0 && usedRows + rowCost > bodyRows) break;
    firstViewportEnd += 1;
    if (rowCost > bodyRows) break;
    usedRows += rowCost;
  }

  return Math.max(messages.length - firstViewportEnd, 0);
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
  const selected: ChatMessage[] = [];
  let usedRows = 0;
  const end = Math.max(messages.length - scrollOffset, 1);

  for (let i = end - 1; i >= 0; i--) {
    const msg = messages[i];
    const rowCost = getMessageRowCost(
      msg,
      selfId,
      termWidth,
      imageMode,
      canRenderInlineImages,
      messageGap
    );
    if (selected.length > 0 && usedRows + rowCost > bodyRows) break;
    if (selected.length === 0 && rowCost > bodyRows) {
      selected.push(msg);
      break;
    }
    selected.push(msg);
    usedRows += rowCost;
  }

  selected.reverse();

  // At the start of history, fill otherwise-empty rows with newer messages.
  for (let i = end; i < messages.length; i++) {
    const msg = messages[i];
    const rowCost = getMessageRowCost(
      msg,
      selfId,
      termWidth,
      imageMode,
      canRenderInlineImages,
      messageGap
    );
    if (usedRows + rowCost > bodyRows) break;
    selected.push(msg);
    usedRows += rowCost;
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
      {visibleMsgs.map((msg, i) => (
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
        />
      ))}
    </>
  );
}
