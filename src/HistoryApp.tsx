import React, { useState } from "react";
import { useApp, useInput, useWindowSize } from "ink";
import { emptyComposerParts } from "./composer-draft.js";
import { useTerminalInfo } from "ink-picture";
import type { ImageMode } from "./config.js";
import type { SavedChatHistory } from "./history-file.js";
import { ChatPage } from "./ui/ChatPage.js";
import { COMPOSER_ROWS, TERMINAL_GUTTER_ROWS } from "./ui/layout.js";
import {
  getMaxMessageScrollOffset,
  moveMessageScrollOffset,
} from "./ui/MessageList.js";

interface HistoryAppProps {
  history: SavedChatHistory;
  initialOffset: number;
  initialImageMode: ImageMode;
  messageGap: number;
}

export function HistoryApp({
  history,
  initialOffset,
  initialImageMode,
  messageGap,
}: HistoryAppProps) {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const terminalInfo = useTerminalInfo();
  const [scrollOffset, setScrollOffset] = useState(initialOffset);
  const [imageMode, setImageMode] = useState(initialImageMode);
  const termWidth = columns || 80;
  const bodyRows = Math.max(
    (rows || 24) - COMPOSER_ROWS - TERMINAL_GUTTER_ROWS,
    1
  );

  useInput((input, key) => {
    const maxOffset = getMaxMessageScrollOffset(
      history.messages,
      bodyRows,
      history.selfId,
      termWidth,
      terminalInfo.cellWidth,
      terminalInfo.cellHeight,
      imageMode,
      messageGap
    );

    if (key.upArrow) {
      setScrollOffset((offset) => Math.min(offset + 1, maxOffset));
    } else if (key.downArrow) {
      setScrollOffset((offset) => Math.max(offset - 1, 0));
    } else if (key.pageUp) {
      setScrollOffset((offset) => moveMessageScrollOffset(
        history.messages,
        bodyRows,
        history.selfId,
        termWidth,
        terminalInfo.cellWidth,
        terminalInfo.cellHeight,
        imageMode,
        messageGap,
        offset,
        "older"
      ));
    } else if (key.pageDown) {
      setScrollOffset((offset) => moveMessageScrollOffset(
        history.messages,
        bodyRows,
        history.selfId,
        termWidth,
        terminalInfo.cellWidth,
        terminalInfo.cellHeight,
        imageMode,
        messageGap,
        offset,
        "newer"
      ));
    } else if (key.end) {
      setScrollOffset(0);
    } else if (key.tab && key.shift) {
      setImageMode((mode) => mode === "inline" ? "off" : "inline");
    } else if (input === "q" || key.escape) {
      exit();
    }
  });

  return (
    <ChatPage
      state={{
        session: history.contact,
        messages: history.messages,
        selfId: history.selfId,
        scrollOffset,
        imageMode,
        messageGap,
        connected: true,
        statusMsg: "",
        composerParts: emptyComposerParts(),
        composerCursor: 0,
        replyTarget: null,
        unreadTotal: 0,
        inlinePickerOpen: false,
        inlinePickerQuery: "",
        inlinePickerItems: [],
        inlinePickerHighlight: 0,
        inlinePickerLoading: false,
      }}
      onInputChange={() => {}}
      onCursorChange={() => {}}
      onSubmit={() => {}}
      onPaste={() => false}
    />
  );
}
