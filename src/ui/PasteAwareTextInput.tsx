import React from "react";
import { Text, useInput, usePaste } from "ink";
import {
  composerLength,
  composerUnits,
  deleteComposerAt,
  deleteComposerBefore,
  insertComposerText,
  type ComposerPart,
} from "../composer-draft.js";

interface PasteAwareTextInputProps {
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

      if (!input) return;
      const next = insertComposerText(parts, cursorOffset, input);
      onChange(next.parts, next.cursor);
    },
    { isActive: focus }
  );

  const units = composerUnits(parts);
  const safeCursor = Math.min(Math.max(cursorOffset, 0), units.length);

  if (units.length === 0) {
    return (
      <Text>
        {placeholder ? (
          <>
            <Text inverse>{placeholder[0]}</Text>
            <Text color="gray">{placeholder.slice(1)}</Text>
          </>
        ) : (
          <Text inverse> </Text>
        )}
      </Text>
    );
  }

  return (
    <Text>
      {units.slice(0, safeCursor).map((unit, index) => (
        <Text key={`before-${index}`}>{unit.label}</Text>
      ))}
      <Text inverse>{units[safeCursor]?.label ?? " "}</Text>
      {units
        .slice(safeCursor + (safeCursor < units.length ? 1 : 0))
        .map((unit, index) => (
          <Text key={`after-${index}`}>{unit.label}</Text>
        ))}
    </Text>
  );
}
