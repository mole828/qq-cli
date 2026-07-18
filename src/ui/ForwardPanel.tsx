import React from "react";
import { Box, Text } from "ink";
import type { ImageMode } from "../config.js";
import type { ChatMessage, ForwardNode } from "../types.js";
import {
  getMaxMessageScrollOffset,
  MessageList,
} from "./MessageList.js";

interface ForwardPanelProps {
  forwardId: string;
  nodes: ForwardNode[] | null;
  loading: boolean;
  scrollOffset: number;
  bodyRows: number;
  termWidth: number;
  cellWidth: number;
  cellHeight: number;
  imageMode: ImageMode;
  isScrolling: boolean;
}

const FORWARD_HEADER_ROWS = 3;
const FORWARD_SELF_ID = -1;
const FORWARD_MESSAGE_GAP = 0;

function forwardNodesToMessages(
  forwardId: string,
  nodes: ForwardNode[] | null
): ChatMessage[] {
  return (nodes || []).map((node, index) => ({
    id: `${forwardId}:${index}`,
    contactId: 0,
    chatType: "private",
    senderId: Number(node.senderId || 0),
    senderName: node.senderName,
    content: "",
    timestamp: node.timestamp || 0,
    isMine: false,
    segments: node.segments,
  }));
}

export function ForwardPanel({
  forwardId,
  nodes,
  loading,
  scrollOffset,
  bodyRows,
  termWidth,
  cellWidth,
  cellHeight,
  imageMode,
  isScrolling,
}: ForwardPanelProps) {
  const messageRows = Math.max(bodyRows - FORWARD_HEADER_ROWS, 1);
  const messages = forwardNodesToMessages(forwardId, nodes);

  return (
    <Box flexDirection="column" height={bodyRows} overflow="hidden">
      <Box height={1} overflow="hidden" paddingX={2}>
        <Text bold>Forward</Text>
        <Text dimColor> · {forwardId} · {nodes?.length ?? 0} nodes</Text>
      </Box>
      <Box height={1} overflow="hidden" paddingX={2}>
        <Text dimColor>
          Esc close · ↑/↓ scroll · PgUp/PgDn page · Shift+Tab images
        </Text>
      </Box>
      <Box height={1} />
      {loading ? (
        <Box paddingX={2}><Text color="yellow">Loading forward…</Text></Box>
      ) : nodes === null ? (
        <Box paddingX={2}><Text color="yellow">Forward unavailable or expired.</Text></Box>
      ) : messages.length === 0 ? (
        <Box paddingX={2}><Text dimColor>No nodes.</Text></Box>
      ) : (
        <Box height={messageRows} flexDirection="column" overflow="hidden">
          <MessageList
            messages={messages}
            selfId={FORWARD_SELF_ID}
            activeSession={null}
            termWidth={termWidth}
            cellWidth={cellWidth}
            cellHeight={cellHeight}
            bodyRows={messageRows}
            imageMode={imageMode}
            scrollOffset={scrollOffset}
            messageGap={FORWARD_MESSAGE_GAP}
            isScrolling={isScrolling}
          />
        </Box>
      )}
    </Box>
  );
}

export function getForwardPanelMaxOffset(
  forwardId: string,
  nodes: ForwardNode[] | null,
  bodyRows: number,
  termWidth: number,
  cellWidth: number,
  cellHeight: number,
  imageMode: ImageMode
) {
  return getMaxMessageScrollOffset(
    forwardNodesToMessages(forwardId, nodes),
    Math.max(bodyRows - FORWARD_HEADER_ROWS, 1),
    FORWARD_SELF_ID,
    termWidth,
    cellWidth,
    cellHeight,
    imageMode,
    FORWARD_MESSAGE_GAP
  );
}
