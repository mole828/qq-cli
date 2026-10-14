import {
  getForwardIdsFromText,
  getForwardSegmentId,
} from "./message-format.js";
import type {
  ChatMessage,
  ForwardNode,
  MentionLabelLookup,
} from "./types.js";
import type { ImageMode } from "./config.js";
import {
  getMaxMessageScrollOffset,
  getMessageScrollOffsetForIndex,
} from "./ui/message-metrics.js";

export const FORWARD_HEADER_ROWS = 3;
export const FORWARD_SELF_ID = -1;
export const FORWARD_MESSAGE_GAP = 0;

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
  const maxOffset = getForwardPanelMaxOffset(
    forwardId, nodes, bodyRows, termWidth, cellWidth, cellHeight, imageMode, mentionLabels
  );
  if (!nodes || nodeIndex < 0 || nodeIndex >= nodes.length) return 0;
  // MessageList measures from the bottom; forward navigation measures from the top.
  return maxOffset - getMessageScrollOffsetForIndex(
    forwardNodesToMessages(forwardId, nodes),
    Math.max(bodyRows - FORWARD_HEADER_ROWS, 1),
    FORWARD_SELF_ID,
    termWidth,
    cellWidth,
    cellHeight,
    imageMode,
    FORWARD_MESSAGE_GAP,
    Math.max(maxOffset - Math.max(currentOffset, 0), 0),
    nodeIndex,
    true,
    mentionLabels
  );
}
