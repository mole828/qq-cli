import React from "react";
import { Box, Text } from "ink";
import type { ImageMode } from "../../config.js";
import type {
  ForwardNode,
  ImageSourceResolver,
  MentionLabelLookup,
} from "../../types.js";
import {
  FORWARD_HEADER_ROWS,
  FORWARD_MESSAGE_GAP,
  FORWARD_SELF_ID,
  forwardNodesToMessages,
  getForwardPanelMaxOffset,
} from "../../forward-view.js";
import { MessageList } from "./MessageList.js";

export {
  forwardNodesToMessages,
  getForwardPanelMaxOffset,
  getForwardPanelScrollOffset,
  getForwardTargets,
} from "../../forward-view.js";
export type { ForwardTarget } from "../../forward-view.js";

interface ForwardPanelProps {
  forwardId: string;
  nodes: ForwardNode[] | null;
  loading: boolean;
  // Rows from the beginning of the record.
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
  const maxOffset = getForwardPanelMaxOffset(
    forwardId, nodes, bodyRows, termWidth, cellWidth, cellHeight, imageMode, mentionLabels
  );
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
          Esc {depth > 1 ? "back" : "close"} · Tab nested · Enter open · ↑/↓ scroll · Home/End · Shift+Tab images
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
            scrollOffset={Math.max(maxOffset - Math.max(scrollOffset, 0), 0)}
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
