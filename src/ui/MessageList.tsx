import React from "react";
import type { ChatMessage, Contact } from "../types.js";
import type { ImageMode } from "../config.js";
import { getFirstImageSource } from "../message-format.js";
import { MAX_MESSAGES } from "./layout.js";
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
}

function getMessageRowCost(
  msg: ChatMessage,
  imageMode: ImageMode,
  canRenderInlineImages: boolean
) {
  if (imageMode !== "inline" || !canRenderInlineImages) return 1;
  return getFirstImageSource(msg) ? INLINE_IMAGE_ROW_COST : 1;
}

function getVisibleMessages(
  messages: ChatMessage[],
  bodyRows: number,
  imageMode: ImageMode,
  canRenderInlineImages: boolean
) {
  const candidates = messages.slice(-MAX_MESSAGES);
  const selected: ChatMessage[] = [];
  let usedRows = 0;

  for (let i = candidates.length - 1; i >= 0; i--) {
    const msg = candidates[i];
    const rowCost = getMessageRowCost(msg, imageMode, canRenderInlineImages);
    if (selected.length > 0 && usedRows + rowCost > bodyRows) break;
    if (selected.length === 0 && rowCost > bodyRows) {
      selected.push(msg);
      break;
    }
    selected.push(msg);
    usedRows += rowCost;
  }

  return selected.reverse();
}

export function MessageList({
  messages,
  selfId,
  activeSession,
  termWidth,
  bodyRows,
  imageMode,
}: MessageListProps) {
  const canRenderInlineImages = bodyRows >= INLINE_IMAGE_ROW_COST;
  const visibleMsgs = getVisibleMessages(
    messages,
    bodyRows,
    imageMode,
    canRenderInlineImages
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
