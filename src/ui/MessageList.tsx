import React from "react";
import type { ChatMessage, Contact } from "../types.js";
import type { ImageMode } from "../config.js";
import { getFirstImageSource } from "../message-format.js";
import { IMAGE_PREVIEW_HEIGHT } from "./ImagePreview.js";
import { MessageRow } from "./MessageRow.js";

const INLINE_IMAGE_ROW_COST = IMAGE_PREVIEW_HEIGHT + 1;

interface MessageListProps {
  messages: ChatMessage[];
  selfId: number;
  activeSession: Contact | null;
  termWidth: number;
  bodyRows: number;
  imageMode: ImageMode;
  scrollOffset: number;
}

function getMessageRowCost(
  msg: ChatMessage,
  imageMode: ImageMode,
  canRenderInlineImages: boolean
) {
  if (imageMode !== "inline" || !canRenderInlineImages) return 1;
  return getFirstImageSource(msg) ? INLINE_IMAGE_ROW_COST : 1;
}

export function getMaxMessageScrollOffset(
  messages: ChatMessage[],
  bodyRows: number,
  imageMode: ImageMode
) {
  const canRenderInlineImages = bodyRows >= INLINE_IMAGE_ROW_COST;
  let usedRows = 0;
  let firstViewportEnd = 0;

  for (const msg of messages) {
    const rowCost = getMessageRowCost(msg, imageMode, canRenderInlineImages);
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
  imageMode: ImageMode,
  canRenderInlineImages: boolean,
  scrollOffset: number
) {
  const selected: ChatMessage[] = [];
  let usedRows = 0;
  const end = Math.max(messages.length - scrollOffset, 1);

  for (let i = end - 1; i >= 0; i--) {
    const msg = messages[i];
    const rowCost = getMessageRowCost(msg, imageMode, canRenderInlineImages);
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
    const rowCost = getMessageRowCost(msg, imageMode, canRenderInlineImages);
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
  scrollOffset,
}: MessageListProps) {
  const canRenderInlineImages = bodyRows >= INLINE_IMAGE_ROW_COST;
  const visibleMsgs = getVisibleMessages(
    messages,
    bodyRows,
    imageMode,
    canRenderInlineImages,
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
        />
      ))}
    </>
  );
}
