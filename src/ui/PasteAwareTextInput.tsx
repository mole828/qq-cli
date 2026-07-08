import React, { useEffect, useState } from "react";
import { Text, useInput, usePaste } from "ink";

interface PasteAwareTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onPaste?: (value: string) => boolean;
  focus?: boolean;
  placeholder?: string;
}

export function PasteAwareTextInput({
  value,
  onChange,
  onSubmit,
  onPaste,
  focus = true,
  placeholder = "",
}: PasteAwareTextInputProps) {
  const [cursorOffset, setCursorOffset] = useState(value.length);

  useEffect(() => {
    setCursorOffset((current) => Math.min(current, value.length));
  }, [value]);

  usePaste(
    (pastedText) => {
      if (onPaste?.(pastedText)) return;
      onChange(
        value.slice(0, cursorOffset) +
          pastedText +
          value.slice(cursorOffset)
      );
      setCursorOffset(cursorOffset + pastedText.length);
    },
    { isActive: focus }
  );

  useInput(
    (input, key) => {
      if (
        key.upArrow ||
        key.downArrow ||
        key.tab ||
        (key.ctrl && input === "c") ||
        ((key.ctrl || key.meta || key.super) && input.toLowerCase() === "v")
      ) {
        return;
      }
      if (key.return) {
        onSubmit?.(value);
        return;
      }
      if (key.leftArrow) {
        setCursorOffset((current) => Math.max(current - 1, 0));
        return;
      }
      if (key.rightArrow) {
        setCursorOffset((current) => Math.min(current + 1, value.length));
        return;
      }
      if (key.home) {
        setCursorOffset(0);
        return;
      }
      if (key.end) {
        setCursorOffset(value.length);
        return;
      }
      if (key.backspace || key.delete) {
        if (cursorOffset === 0) return;
        onChange(
          value.slice(0, cursorOffset - 1) + value.slice(cursorOffset)
        );
        setCursorOffset(cursorOffset - 1);
        return;
      }

      onChange(
        value.slice(0, cursorOffset) + input + value.slice(cursorOffset)
      );
      setCursorOffset(cursorOffset + input.length);
    },
    { isActive: focus }
  );

  if (!value) {
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
      {value.slice(0, cursorOffset)}
      <Text inverse>{value[cursorOffset] ?? " "}</Text>
      {value.slice(cursorOffset + (cursorOffset < value.length ? 1 : 0))}
    </Text>
  );
}
