import React from "react";
import { Box, useWindowSize } from "ink";
import { useTerminalInfo } from "ink-picture";
import type { ImageAttachment } from "../clipboard-image.js";
import type { ImageMode } from "../config.js";
import type { ChatMessage, Contact, ImageSourceResolver } from "../types.js";
import { COMPOSER_ROWS, TERMINAL_GUTTER_ROWS } from "./layout.js";
import { Composer } from "./Composer.js";
import {
  getMaxMessageScrollOffset,
  MessageList,
} from "./MessageList.js";
import { useImageMetadataVersion } from "./ImagePreview.js";

export interface ChatPageState {
  session: Contact;
  messages: ChatMessage[];
  selfId: number;
  scrollOffset: number;
  imageMode: ImageMode;
  messageGap: number;
  connected: boolean;
  statusMsg: string;
  inputText: string;
  attachments: ImageAttachment[];
  unreadTotal: number;
  moveCursorToEndKey: number;
}

interface ChatPageProps {
  state: ChatPageState;
  onInputChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onPaste: (value: string) => boolean;
  resolveImageSource?: ImageSourceResolver;
}

export function ChatPage({
  state,
  onInputChange,
  onSubmit,
  onPaste,
  resolveImageSource,
}: ChatPageProps) {
  const { columns, rows } = useWindowSize();
  const terminalInfo = useTerminalInfo();
  useImageMetadataVersion();

  const termWidth = columns || 80;
  const termHeight = rows || 24;
  const bodyRows = Math.max(
    termHeight - COMPOSER_ROWS - TERMINAL_GUTTER_ROWS,
    1
  );
  const maxOffset = getMaxMessageScrollOffset(
    state.messages,
    bodyRows,
    state.selfId,
    termWidth,
    terminalInfo.cellWidth,
    terminalInfo.cellHeight,
    state.imageMode,
    state.messageGap
  );
  const effectiveOffset = Math.min(Math.max(state.scrollOffset, 0), maxOffset);

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        height={bodyRows}
        flexShrink={1}
        overflow="hidden"
      >
        {state.messages.length > 0 ? (
          <MessageList
            messages={state.messages}
            selfId={state.selfId}
            activeSession={state.session}
            termWidth={termWidth}
            cellWidth={terminalInfo.cellWidth}
            cellHeight={terminalInfo.cellHeight}
            bodyRows={bodyRows}
            imageMode={state.imageMode}
            scrollOffset={effectiveOffset}
            messageGap={state.messageGap}
            resolveImageSource={resolveImageSource}
          />
        ) : null}
      </Box>

      <Composer
        inputText={state.inputText}
        onChange={onInputChange}
        onSubmit={onSubmit}
        onPaste={onPaste}
        helpMode={false}
        modalMode={false}
        forwardMode={false}
        activeSession={state.session}
        statusMsg={state.statusMsg}
        connected={state.connected}
        unreadTotal={state.unreadTotal}
        termWidth={termWidth}
        attachments={state.attachments}
        imageMode={state.imageMode}
        moveCursorToEndKey={state.moveCursorToEndKey}
      />
    </Box>
  );
}
