import React from "react";
import type {
  ChatMessage,
  Contact,
  ImageSourceResolver,
  MentionLabelLookup,
} from "../../types.js";
import type { ImageMode } from "../../config.js";
import { getImageSources } from "../../message-format.js";
import {
  IMAGE_PREVIEW_HEIGHT,
  INLINE_IMAGE_ROW_COST,
  buildReplyLookup,
  getImageStripHeight,
  getVisibleMessages,
} from "../message-metrics.js";
import { MessageRow } from "./MessageRow.js";

export {
  getMaxMessageScrollOffset,
  getMessageScrollOffsetForIndex,
  getMessageScrollRows,
  moveMessageScrollOffset,
} from "../message-metrics.js";

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
  selectedMessageId?: string | null;
  forwardSegmentId?: boolean;
  mentionLabels?: MentionLabelLookup;
  resolveImageSource?: ImageSourceResolver;
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
  selectedMessageId,
  forwardSegmentId = false,
  mentionLabels,
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
    scrollOffset,
    forwardSegmentId,
    mentionLabels
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
          selected={selectedMessageId === String(msg.id)}
          forwardSegmentId={forwardSegmentId}
          mentionLabels={mentionLabels}
          resolveImageSource={resolveImageSource}
        />
      ))}
    </>
  );
}
