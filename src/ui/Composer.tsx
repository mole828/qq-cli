import React from "react";
import { Box, Text } from "ink";
import {
  composerDisplayText,
  type ComposerPart,
} from "../composer-draft.js";
import type { ImageMode } from "../config.js";
import type { Contact, InlineInsertItem, ReplyTarget } from "../types.js";
import { textWidth, truncateCells } from "../terminal-text.js";
import { getComposerRows } from "./layout.js";
import { InlineInsertPanel } from "./InlineInsertPanel.js";
import { PasteAwareTextInput } from "./PasteAwareTextInput.js";

interface ComposerProps {
  parts: ComposerPart[];
  cursorOffset: number;
  onChange: (parts: ComposerPart[], cursorOffset: number) => void;
  onCursorChange: (cursorOffset: number) => void;
  onSubmit: () => void;
  onPaste: (value: string, cursorOffset: number) => boolean;
  helpMode: boolean;
  modalMode: boolean;
  facesMode?: boolean;
  forwardMode: boolean;
  activeSession: Contact | null;
  statusMsg: string;
  replyTarget: ReplyTarget | null;
  connected: boolean;
  unreadTotal: number;
  mentionTotal: number;
  termWidth: number;
  imageMode: ImageMode;
  inlinePickerOpen?: boolean;
  inlinePickerQuery?: string;
  inlinePickerItems?: InlineInsertItem[];
  inlinePickerHighlight?: number;
  inlinePickerLoading?: boolean;
}

export function Composer({
  parts,
  cursorOffset,
  onChange,
  onCursorChange,
  onSubmit,
  onPaste,
  helpMode,
  modalMode,
  facesMode = false,
  forwardMode,
  activeSession,
  statusMsg,
  replyTarget,
  connected,
  unreadTotal,
  mentionTotal,
  termWidth,
  imageMode,
  inlinePickerOpen = false,
  inlinePickerQuery = "",
  inlinePickerItems = [],
  inlinePickerHighlight = 0,
  inlinePickerLoading = false,
}: ComposerProps) {
  const divider = "─".repeat(Math.max(termWidth - 2, 4));
  const composerWidth = Math.max(termWidth - 2, 12);
  const composerBg = "#3a3a3a";
  const workspace = helpMode
    ? "~/help"
    : facesMode
    ? "~/faces"
    : forwardMode
    ? "~/forward"
    : modalMode
    ? "~/sessions"
    : activeSession
    ? `~/${activeSession.type === "group" ? "groups" : "directs"}/${activeSession.name.replaceAll("/", "∕")}`
    : "~/sessions";
  const displayedWorkspace = truncateCells(
    workspace,
    Math.max(Math.min(Math.floor(termWidth * 0.45), 44), 12)
  );
  const transientStatus = /loading|reloading|failed|unavailable|unknown|usage:|clipboard|attach|send|not found/i.test(
    statusMsg
  )
    ? statusMsg
    : "";
  const composerPlaceholder = helpMode
    ? "Esc to close help"
    : facesMode
    ? "Esc to close faces"
    : forwardMode
    ? "Esc to close forward"
    : modalMode
    ? "Filter sessions, then Enter"
    : activeSession
    ? "Message current session"
    : "Use /session to choose a session";
  const inputDisplayText = composerDisplayText(parts);
  const replyPrefix = replyTarget ? "[reply] " : "";
  const inputChromeWidth = 4 + textWidth(replyPrefix);
  const inputVisibleWidth = Math.min(
    Math.max(textWidth(inputDisplayText || composerPlaceholder) + 1, 1),
    Math.max(composerWidth - inputChromeWidth - 2, 1)
  );
  const inputTailWidth = Math.max(
    composerWidth - inputVisibleWidth - inputChromeWidth - 2,
    0
  );
  const imageModeLabel = imageMode === "inline" ? "Images: inline" : "";
  const composerRows = getComposerRows(inlinePickerOpen);
  const replyLabel = replyTarget
    ? truncateCells(
        ` · ↳ #${replyTarget.messageId} ${replyTarget.senderName}: ${replyTarget.preview}`,
        Math.max(Math.min(Math.floor(composerWidth * 0.55), 64), 16)
      )
    : "";
  const statusWidth = Math.max(composerWidth - textWidth(imageModeLabel) - 3, 1);

  return (
    <Box
      height={composerRows}
      flexShrink={0}
      overflow="hidden"
      flexDirection="column"
    >
      {inlinePickerOpen && (
        <InlineInsertPanel
          items={inlinePickerItems}
          query={inlinePickerQuery}
          highlightIndex={inlinePickerHighlight}
          loading={inlinePickerLoading}
          width={composerWidth}
        />
      )}
      <Box height={1} paddingX={1}>
        <Text color="gray" dimColor>
          {divider}
        </Text>
      </Box>
      <Box flexDirection="column" width={composerWidth} marginX={1}>
        <Box height={1} backgroundColor={composerBg}>
          <Text backgroundColor={composerBg}>{" ".repeat(composerWidth)}</Text>
        </Box>
        <Box
          flexDirection="row"
          height={1}
          overflow="hidden"
          paddingX={1}
          backgroundColor={composerBg}
        >
          <Text color="white" backgroundColor={composerBg} bold>
            ›{" "}
          </Text>
          {replyPrefix && (
            <Text color="cyan" backgroundColor={composerBg}>
              {replyPrefix}
            </Text>
          )}
          <Text color="white" backgroundColor={composerBg}>
            <PasteAwareTextInput
              parts={parts}
              cursorOffset={cursorOffset}
              onChange={onChange}
              onCursorChange={onCursorChange}
              onSubmit={onSubmit}
              onPaste={onPaste}
              focus={!helpMode && !facesMode && !forwardMode}
              placeholder={composerPlaceholder}
              inlinePickerOpen={inlinePickerOpen}
            />
          </Text>
          <Text backgroundColor={composerBg}>
            {" ".repeat(inputTailWidth)}
          </Text>
        </Box>
        <Box height={1} backgroundColor={composerBg}>
          <Text backgroundColor={composerBg}>{" ".repeat(composerWidth)}</Text>
        </Box>
        <Box height={1} overflow="hidden" paddingX={1}>
          <Box width={statusWidth} flexShrink={1} overflow="hidden">
            <Text color="#e8d5a3">qq-cli</Text>
            <Text dimColor> · </Text>
            <Text color="green">{displayedWorkspace}</Text>
            <Text dimColor> · </Text>
            <Text color={connected ? undefined : "yellow"} dimColor={connected}>
              {connected ? "online" : "reconnecting"}
            </Text>
            {unreadTotal > 0 && (
              <Text color="yellow"> · {unreadTotal} unread</Text>
            )}
            {mentionTotal > 0 && (
              <Text color="magenta">
                {` · ${mentionTotal} mention${mentionTotal === 1 ? "" : "s"}`}
              </Text>
            )}
            {replyLabel && (
              <Text color="cyan" wrap="truncate-end">
                {replyLabel}
              </Text>
            )}
            {transientStatus && (
              <Text color="yellow" wrap="truncate-end">
                {` · ${transientStatus}`}
              </Text>
            )}
          </Box>
          <Box flexGrow={1} />
          {imageModeLabel && <Text color="magenta">{imageModeLabel}</Text>}
        </Box>
      </Box>
    </Box>
  );
}
