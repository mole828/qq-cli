import React from "react";
import { Box, Text, useInput, usePaste } from "ink";
import {
  composerLength,
  deleteComposerAt,
  deleteComposerBefore,
  insertComposerText,
  type ComposerPart,
} from "../composer-draft.js";

import { getComposerInputLayout } from "../composer-layout.js";
import { textWidth } from "../terminal-text.js";
import { isComposerNewline } from "../composer-key.js";

interface PasteAwareTextInputProps {
  width?: number;
  maxRows?: number;
  parts: ComposerPart[];
  cursorOffset: number;
  onChange: (parts: ComposerPart[], cursorOffset: number) => void;
  onCursorChange: (cursorOffset: number) => void;
  onSubmit?: () => void;
  onPaste?: (value: string, cursorOffset: number) => boolean;
  focus?: boolean;
  placeholder?: string;
  inlinePickerOpen?: boolean;
}

export function PasteAwareTextInput({
  width = 72,
  maxRows = 5,
  parts,
  cursorOffset,
  onChange,
  onCursorChange,
  onSubmit,
  onPaste,
  focus = true,
  placeholder = "",
  inlinePickerOpen = false,
}: PasteAwareTextInputProps) {
  usePaste(
    (pastedText) => {
      if (onPaste?.(pastedText, cursorOffset)) return;
      const next = insertComposerText(parts, cursorOffset, pastedText);
      onChange(next.parts, next.cursor);
    },
    { isActive: focus }
  );

  useInput(
    (input, key) => {
      if (isComposerNewline(input, key)) {
        const next = insertComposerText(parts, cursorOffset, "\n");
        onChange(next.parts, next.cursor);
        return;
      }
      if (key.escape || key.pageUp || key.pageDown) return;
      if ((key.upArrow || key.downArrow) && !inlinePickerOpen && composerLength(parts) > 0) {
        const layout = getComposerInputLayout(parts, cursorOffset, width, maxRows);
        const row = layout.rows[layout.cursorRow];
        const column = row.filter((unit) => unit.index < cursorOffset).reduce((sum, unit) => sum + textWidth(unit.label), 0);
        const target = layout.rows[layout.cursorRow + (key.upArrow ? -1 : 1)];
        if (target) {
          let cells = 0;
          let offset = target[0].index;
          for (const unit of target) {
            if (cells > column) break;
            offset = unit.index;
            cells += textWidth(unit.label);
          }
          onCursorChange(offset);
        }
        return;
      }
      if (
        key.upArrow ||
        key.downArrow ||
        key.tab ||
        (key.ctrl && input.toLowerCase() === "f") ||
        (key.ctrl && input === "c") ||
        ((key.ctrl || key.meta || key.super) && input.toLowerCase() === "v")
      ) {
        return;
      }
      if (key.return) {
        if (inlinePickerOpen) return;
        onSubmit?.();
        return;
      }
      if (key.ctrl && input.toLowerCase() === "a") {
        onCursorChange(0);
        return;
      }
      if (key.ctrl && input.toLowerCase() === "e") {
        onCursorChange(composerLength(parts));
        return;
      }
      if (key.leftArrow) {
        if (key.meta || key.super) {
          onCursorChange(0);
        } else {
          onCursorChange(Math.max(cursorOffset - 1, 0));
        }
        return;
      }
      if (key.rightArrow) {
        if (key.meta || key.super) {
          onCursorChange(composerLength(parts));
        } else {
          onCursorChange(Math.min(cursorOffset + 1, composerLength(parts)));
        }
        return;
      }
      if (key.home) {
        onCursorChange(0);
        return;
      }
      if (key.end) {
        onCursorChange(composerLength(parts));
        return;
      }
      if (key.backspace || key.delete) {
        const next = key.backspace
          ? deleteComposerBefore(parts, cursorOffset)
          : deleteComposerAt(parts, cursorOffset);
        if (next.parts !== parts || next.cursor !== cursorOffset) {
          onChange(next.parts, next.cursor);
        }
        return;
      }

      if (!input || key.ctrl || key.meta || key.super) return;
      const next = insertComposerText(parts, cursorOffset, input);
      onChange(next.parts, next.cursor);
    },
    { isActive: focus }
  );

  const layout = getComposerInputLayout(parts, cursorOffset, width, maxRows);
  const safeCursor = Math.min(Math.max(cursorOffset, 0), composerLength(parts));
  if (composerLength(parts) === 0) {
    return <Text wrap="truncate-end"><Text inverse>{placeholder[0] || " "}</Text><Text color="gray">{placeholder.slice(1)}</Text></Text>;
  }
  return (
    <Box flexDirection="column" width={width}>
      {layout.visibleRows.map((row, rowIndex) => (
        <Text key={layout.startRow + rowIndex} wrap="truncate-end">
          {row.map((unit) => (
            <Text key={unit.index} inverse={unit.index === safeCursor}>{unit.label}</Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
