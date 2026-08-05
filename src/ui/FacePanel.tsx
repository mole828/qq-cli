import React from "react";
import { Box, Text } from "ink";
import type { ImageSourceResolver, StickerItem } from "../types.js";
import { truncateCells } from "../terminal-text.js";
import { ImagePreview } from "./ImagePreview.js";

const PANEL_PADDING = 2;
const HEADER_ROWS = 3;
const SELECTED_PREVIEW_ROWS = 5;
const SLOT_HEIGHT = 5;
const MIN_SLOT_WIDTH = 16;
const MAX_SLOT_WIDTH = 26;

export interface FacePanelLayout {
  columns: number;
  rows: number;
  visibleCount: number;
  slotWidth: number;
  gridHeight: number;
}

export function getFacePanelLayout(
  bodyRows: number,
  termWidth: number
): FacePanelLayout {
  const panelWidth = Math.max(termWidth - PANEL_PADDING, MIN_SLOT_WIDTH);
  const slotWidth = Math.min(
    MAX_SLOT_WIDTH,
    Math.max(Math.floor(panelWidth / 4), MIN_SLOT_WIDTH)
  );
  const columns = Math.max(Math.floor(panelWidth / slotWidth), 1);
  const gridHeight = Math.max(bodyRows - HEADER_ROWS - SELECTED_PREVIEW_ROWS, SLOT_HEIGHT);
  const rows = Math.max(Math.floor(gridHeight / SLOT_HEIGHT), 1);

  return {
    columns,
    rows,
    visibleCount: columns * rows,
    slotWidth,
    gridHeight: rows * SLOT_HEIGHT,
  };
}

interface FacePanelProps {
  items: StickerItem[];
  capability: "unknown" | "supported" | "unsupported";
  loading: boolean;
  highlightIndex: number;
  scrollOffset: number;
  bodyRows: number;
  termWidth: number;
  statusMsg: string;
  resolveImageSource?: ImageSourceResolver;
}

export function FacePanel({
  items,
  capability,
  loading,
  highlightIndex,
  scrollOffset,
  bodyRows,
  termWidth,
  statusMsg,
  resolveImageSource,
}: FacePanelProps) {
  const layout = getFacePanelLayout(bodyRows, termWidth);
  const selected = items[highlightIndex];
  const visibleItems = items.slice(
    scrollOffset,
    scrollOffset + layout.visibleCount
  );
  const panelWidth = Math.max(termWidth - PANEL_PADDING, MIN_SLOT_WIDTH);

  return (
    <Box
      flexDirection="column"
      height={bodyRows}
      paddingX={1}
      overflow="hidden"
    >
      <Box height={1} justifyContent="space-between" overflow="hidden">
        <Text bold>• Faces · custom</Text>
        <Text dimColor wrap="truncate-end">
          {loading
            ? "probing adapter…"
            : capability === "supported"
            ? `${items.length} available`
            : capability === "unsupported"
            ? "extension unavailable"
            : "not checked"}
        </Text>
      </Box>
      <Box height={1} overflow="hidden">
        <Text dimColor>
          Esc close · arrows select · Enter add · r refresh
        </Text>
      </Box>
      <Box height={1} overflow="hidden">
        <Text color="gray" wrap="truncate-end">
          {truncateCells(
            statusMsg || "NapCat custom-face extension is detected on demand.",
            Math.max(panelWidth, 1)
          )}
        </Text>
      </Box>

      {loading ? (
        <Box paddingTop={1}>
          <Text color="yellow">Checking fetch_custom_face…</Text>
        </Box>
      ) : capability === "unsupported" ? (
        <Box flexDirection="column" paddingTop={1}>
          <Text color="yellow">Custom faces are unavailable on this adapter.</Text>
          <Text dimColor>
            Use Cmd+V / Ctrl+V or configure QQ_CLI_CUSTOM_FACE_ACTION.
          </Text>
        </Box>
      ) : capability === "supported" && items.length === 0 ? (
        <Box paddingTop={1}>
          <Text dimColor>No custom faces returned by the adapter.</Text>
        </Box>
      ) : selected ? (
        <>
          <Box height={SELECTED_PREVIEW_ROWS} overflow="hidden" paddingTop={1}>
            <Box width={32} height={SELECTED_PREVIEW_ROWS - 1} overflow="hidden">
              <ImagePreview
                source={selected.file}
                height={SELECTED_PREVIEW_ROWS - 1}
                maxWidth={28}
                resolveSource={resolveImageSource}
              />
            </Box>
            <Box flexDirection="column" paddingLeft={1} overflow="hidden">
              <Text color="yellow" bold>
                #{highlightIndex + 1} selected
              </Text>
              <Text dimColor wrap="truncate-end">
                {truncateCells(selected.file, Math.max(panelWidth - 34, 12))}
              </Text>
              <Text dimColor>Enter adds this face to the composer.</Text>
            </Box>
          </Box>
          <Box
            height={layout.gridHeight}
            flexDirection="column"
            overflow="hidden"
          >
            {Array.from({ length: layout.rows }, (_, rowIndex) => (
              <Box key={rowIndex} height={SLOT_HEIGHT} flexDirection="row">
                {visibleItems
                  .slice(rowIndex * layout.columns, (rowIndex + 1) * layout.columns)
                  .map((item, columnIndex) => {
                    const index = scrollOffset + rowIndex * layout.columns + columnIndex;
                    const highlighted = index === highlightIndex;
                    return (
                      <Box
                        key={item.id}
                        width={layout.slotWidth}
                        height={SLOT_HEIGHT}
                        flexDirection="column"
                        overflow="hidden"
                      >
                        <Text color={highlighted ? "yellow" : "cyan"} bold>
                          {highlighted ? "›" : " "} #{index + 1}
                        </Text>
                        <ImagePreview
                          source={item.file}
                          height={SLOT_HEIGHT - 1}
                          maxWidth={layout.slotWidth - 1}
                          clipped
                          resolveSource={resolveImageSource}
                        />
                      </Box>
                    );
                  })}
              </Box>
            ))}
          </Box>
        </>
      ) : (
        <Box paddingTop={1}>
          <Text dimColor>Waiting for a connected adapter.</Text>
        </Box>
      )}
    </Box>
  );
}
