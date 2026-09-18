import React from "react";
import { Box, Text } from "ink";
import type { CompletionItem } from "../completion.js";
import { textWidth, truncateCells } from "../terminal-text.js";
import { INLINE_PICKER_ROWS } from "./layout.js";

export function CompletionPanel({ items, highlight, width, enterExecutes = false }: {
  items: CompletionItem[]; highlight: number; width: number; enterExecutes?: boolean;
}) {
  const visibleCount = INLINE_PICKER_ROWS - 1;
  const selected = Math.min(Math.max(highlight, 0), Math.max(items.length - 1, 0));
  const offset = Math.max(0, selected - visibleCount + 1);
  return (
    <Box marginX={1} width={width} height={INLINE_PICKER_ROWS} flexDirection="column" overflow="hidden">
      {Array.from({ length: visibleCount }, (_, row) => {
        const index = offset + row;
        const item = items[index];
        const label = item ? `${index === selected ? "›" : " "} ${item.label.replace(/\s+/g, " ")}` : " ";
        const title = truncateCells(label, width);
        const hintWidth = width - textWidth(title) - 3;
        const hint = item?.description && hintWidth >= 4
          ? truncateCells(item.description, hintWidth) : "";
        return (
          <Box key={row} height={1} overflow="hidden">
            <Text bold={index === selected} dimColor={index !== selected} wrap="truncate-end">{title}</Text>
            {hint && <Text dimColor wrap="truncate-end">{` · ${hint}`}</Text>}
          </Box>
        );
      })}
      <Text dimColor wrap="truncate-end">{truncateCells(`${selected + 1}/${items.length} · ↑↓ select · ${enterExecutes ? "Tab accept · Enter run" : "Tab/Enter accept"} · Esc close`, width)}</Text>
    </Box>
  );
}
