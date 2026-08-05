import React from "react";
import { Box, Text } from "ink";
import type { InlineInsertItem } from "../types.js";
import { truncateCells } from "../terminal-text.js";
import { INLINE_PICKER_ROWS } from "./layout.js";

const PANEL_BACKGROUND = "#303030";
const VISIBLE_ITEMS = INLINE_PICKER_ROWS - 2;

interface InlineInsertPanelProps {
  items: InlineInsertItem[];
  query: string;
  highlightIndex: number;
  loading: boolean;
  width: number;
}

export function InlineInsertPanel({
  items,
  query,
  highlightIndex,
  loading,
  width,
}: InlineInsertPanelProps) {
  const safeHighlight = Math.min(
    Math.max(highlightIndex, 0),
    Math.max(items.length - 1, 0)
  );
  const scrollOffset = Math.min(
    Math.max(safeHighlight - VISIBLE_ITEMS + 1, 0),
    Math.max(items.length - VISIBLE_ITEMS, 0)
  );
  const visibleItems = items.slice(
    scrollOffset,
    scrollOffset + VISIBLE_ITEMS
  );
  const contentWidth = Math.max(width - 2, 8);
  const queryLabel = query ? `@${query}` : "@";
  const footer = items.length
    ? `↑↓ select · Enter insert · Esc close · ${safeHighlight + 1}/${items.length}`
    : "↑↓ select · Enter insert · Esc close";

  return (
    <Box
      width={width}
      height={INLINE_PICKER_ROWS}
      marginX={1}
      flexDirection="column"
      overflow="hidden"
      backgroundColor={PANEL_BACKGROUND}
    >
      <Box height={1} paddingX={1} justifyContent="space-between" overflow="hidden">
        <Text color="yellow" backgroundColor={PANEL_BACKGROUND} bold wrap="truncate-end">
          {truncateCells(`› ${queryLabel}`, Math.max(contentWidth - 16, 8))}
        </Text>
        <Text color="gray" backgroundColor={PANEL_BACKGROUND} dimColor wrap="truncate-end">
          {items.length ? `${items.length} members` : loading ? "loading" : "no matches"}
        </Text>
      </Box>

      {Array.from({ length: VISIBLE_ITEMS }, (_, rowIndex) => {
        const index = scrollOffset + rowIndex;
        const item = visibleItems[rowIndex];
        if (!item) {
          return (
            <Box key={`empty-${rowIndex}`} height={1} paddingX={1} backgroundColor={PANEL_BACKGROUND}>
              <Text backgroundColor={PANEL_BACKGROUND}> </Text>
            </Box>
          );
        }

        const highlighted = index === safeHighlight;
        const marker = highlighted ? "›" : " ";
        const rowText = `${marker} @${item.label} · ${item.detail}`;
        return (
          <Box key={item.id} height={1} paddingX={1} backgroundColor={PANEL_BACKGROUND} overflow="hidden">
            <Text
              color={highlighted ? "yellow" : "cyan"}
              backgroundColor={PANEL_BACKGROUND}
              bold={highlighted}
              wrap="truncate-end"
            >
              {truncateCells(rowText, contentWidth)}
            </Text>
          </Box>
        );
      })}

      <Box height={1} paddingX={1} backgroundColor={PANEL_BACKGROUND} overflow="hidden">
        <Text color="gray" backgroundColor={PANEL_BACKGROUND} dimColor wrap="truncate-end">
          {truncateCells(footer, contentWidth)}
        </Text>
      </Box>
    </Box>
  );
}
