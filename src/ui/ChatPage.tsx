import React from "react";
import { Box, useWindowSize } from "ink";
import { useTerminalInfo } from "ink-picture";
import type { ComposerPart } from "../composer-draft.js";
import type { ImageMode } from "../config.js";
import type {
  ChatMessage,
  Contact,
  ImageSourceResolver,
  ReplyTarget,
} from "../types.js";
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
  composerParts: ComposerPart[];
  composerCursor: number;
  replyTarget: ReplyTarget | null;
  unreadTotal: number;
}

interface ChatPageProps {
  state: ChatPageState;
  onInputChange: (parts: ComposerPart[], cursorOffset: number) => void;
  onCursorChange: (cursorOffset: number) => void;
  onSubmit: () => void;
  onPaste: (value: string, cursorOffset: number) => boolean;
  resolveImageSource?: ImageSourceResolver;
}

export function ChatPage({
  state,
  onInputChange,
  onCursorChange,
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
        onChange={onInputChange}
        onSubmit={onSubmit}
        onPaste={onPaste}
        helpMode={false}
        modalMode={false}
        forwardMode={false}
        activeSession={state.session}
        statusMsg={state.statusMsg}
        replyTarget={state.replyTarget}
        connected={state.connected}
        unreadTotal={state.unreadTotal}
        termWidth={termWidth}
        parts={state.composerParts}
        cursorOffset={state.composerCursor}
        onCursorChange={onCursorChange}
        imageMode={state.imageMode}
      />
    </Box>
  );
}
