import React from "react";
import { Box, Text } from "ink";
import type { ImageMode } from "../config.js";
import {
  getForwardIdsFromText,
  getForwardSegmentId,
} from "../message-format.js";
import type {
  ChatMessage,
  ForwardNode,
  ImageSourceResolver,
  MentionLabelLookup,
} from "../types.js";
import {
  getMaxMessageScrollOffset,
  getMessageScrollOffsetForIndex,
  MessageList,
} from "./MessageList.js";

interface ForwardPanelProps {
  forwardId: string;
  nodes: ForwardNode[] | null;
  loading: boolean;
  scrollOffset: number;
  selectedNodeIndex: number | null;
  depth: number;
  bodyRows: number;
  termWidth: number;
  cellWidth: number;
  cellHeight: number;
  imageMode: ImageMode;
  mentionLabels?: MentionLabelLookup;
  resolveImageSource?: ImageSourceResolver;
}

const FORWARD_HEADER_ROWS = 3;
const FORWARD_SELF_ID = -1;
const FORWARD_MESSAGE_GAP = 0;

export interface ForwardTarget {
  nodeIndex: number;
  segmentIndex: number;
  id: string;
  inlineContent?: unknown;
}

export function forwardNodesToMessages(
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

export function getForwardTargets(nodes: ForwardNode[] | null): ForwardTarget[] {
  if (!nodes) return [];

  return nodes.flatMap((node, nodeIndex) =>
    node.segments.flatMap((segment, segmentIndex) => {
      const id = getForwardSegmentId(segment);
      if (id) {
        const hasInlineContent = Object.prototype.hasOwnProperty.call(
          segment.data,
          "content"
        );
        return [{
          nodeIndex,
          segmentIndex,
          id,
          ...(hasInlineContent ? { inlineContent: segment.data.content } : {}),
        }];
      }
      if (segment.type !== "text" || typeof segment.data.text !== "string") {
        return [];
      }
      return getForwardIdsFromText(segment.data.text).map((textId) => ({
        nodeIndex,
        segmentIndex,
        id: textId,
      }));
    })
  );
}

export function ForwardPanel({
  forwardId,
  nodes,
  loading,
  scrollOffset,
  selectedNodeIndex,
  depth,
  bodyRows,
  termWidth,
  cellWidth,
  cellHeight,
  imageMode,
  mentionLabels,
  resolveImageSource,
}: ForwardPanelProps) {
  const messageRows = Math.max(bodyRows - FORWARD_HEADER_ROWS, 1);
  const messages = forwardNodesToMessages(forwardId, nodes);
  const selectedMessageId = selectedNodeIndex === null
    ? null
    : `${forwardId}:${selectedNodeIndex}`;

  return (
    <Box flexDirection="column" height={bodyRows} overflow="hidden">
      <Box height={1} overflow="hidden" paddingX={2}>
        <Text bold>Forward</Text>
        <Text dimColor> · {forwardId} · {nodes?.length ?? 0} nodes</Text>
      </Box>
      <Box height={1} overflow="hidden" paddingX={2}>
        <Text dimColor>
          Esc {depth > 1 ? "back" : "close"} · Tab nested · Enter open · ↑/↓ scroll · Shift+Tab images
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
            mentionLabels={mentionLabels}
            scrollOffset={scrollOffset}
            messageGap={FORWARD_MESSAGE_GAP}
            selectedMessageId={selectedMessageId}
            forwardSegmentId
            resolveImageSource={resolveImageSource}
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
  imageMode: ImageMode,
  mentionLabels?: MentionLabelLookup
) {
  return getMaxMessageScrollOffset(
    forwardNodesToMessages(forwardId, nodes),
    Math.max(bodyRows - FORWARD_HEADER_ROWS, 1),
    FORWARD_SELF_ID,
    termWidth,
    cellWidth,
    cellHeight,
    imageMode,
    FORWARD_MESSAGE_GAP,
    true,
    mentionLabels
  );
}

export function getForwardPanelScrollOffset(
  forwardId: string,
  nodes: ForwardNode[] | null,
  nodeIndex: number,
  bodyRows: number,
  termWidth: number,
  cellWidth: number,
  cellHeight: number,
  imageMode: ImageMode,
  currentOffset: number,
  mentionLabels?: MentionLabelLookup
) {
  return getMessageScrollOffsetForIndex(
    forwardNodesToMessages(forwardId, nodes),
    Math.max(bodyRows - FORWARD_HEADER_ROWS, 1),
    FORWARD_SELF_ID,
    termWidth,
    cellWidth,
    cellHeight,
    imageMode,
    FORWARD_MESSAGE_GAP,
    currentOffset,
    nodeIndex,
    true,
    mentionLabels
  );
}
