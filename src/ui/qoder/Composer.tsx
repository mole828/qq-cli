import { isCompleteCommand, type CompletionItem } from "../../completion.js";
import { CompletionPanel } from "./CompletionPanel.js";
import React from "react";
import { Box, Text } from "ink";
import {
  composerText,
  type ComposerPart,
} from "../../composer-draft.js";
import { getComposerInputLayout } from "../../composer-layout.js";
import type { ImageMode } from "../../config.js";
import type { Contact, InlineInsertItem, ReplyTarget } from "../../types.js";
import { singleLine, textWidth, truncateCells } from "../../terminal-text.js";
import {
  getComposerBoxWidth,
  getComposerInputWidth,
  getComposerRows,
} from "../layout.js";
import { InlineInsertPanel } from "./InlineInsertPanel.js";
import { PasteAwareTextInput } from "../PasteAwareTextInput.js";
import { ACCENT, DIM, PROMPT_GLYPH, WARN } from "./palette.js";

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
  completionItems?: CompletionItem[];
  completionHighlight?: number;
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
  completionItems = [],
  completionHighlight = 0,
  inlinePickerOpen = false,
  inlinePickerQuery = "",
  inlinePickerItems = [],
  inlinePickerHighlight = 0,
  inlinePickerLoading = false,
}: ComposerProps) {
  const divider = "─".repeat(Math.max(termWidth - 2, 4));
  const composerWidth = getComposerBoxWidth(termWidth);
  const composerBg = undefined;
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
  const replyPrefix = replyTarget ? "[reply] " : "";
  const imageModeLabel = imageMode === "inline" ? "Images: inline" : "";
  const inputWidth = getComposerInputWidth(termWidth, Boolean(replyTarget));
  const inputLayout = getComposerInputLayout(parts, cursorOffset, inputWidth, 5);
  const composerRows = getComposerRows(inlinePickerOpen || completionItems.length > 0, inputLayout.height);
  const availWidth = Math.max(composerWidth - 2, 1);
  const detail = singleLine(transientStatus || (replyTarget
    ? `↳ #${replyTarget.messageId} ${replyTarget.senderName}: ${replyTarget.preview}`
    : ""));
  const counts = (unreadTotal > 0 ? ` · ${unreadTotal} unread` : "") +
    (mentionTotal > 0 ? ` · ${mentionTotal} mention${mentionTotal === 1 ? "" : "s"}` : "");
  const connection = connected ? "online" : "reconnecting";
  const coreCandidates = [
    `qq-cli · ${connection}${counts}`,
    `qq-cli · ${connection}` +
      (unreadTotal > 0 ? ` · ${unreadTotal}u` : "") +
      (mentionTotal > 0 ? ` · ${mentionTotal}@` : ""),
    `qq-cli · ${connection}`,
    connection,
    "",
  ];
  // Errors take priority over counters and the workspace path.
  const detailReserve = detail ? Math.min(textWidth(detail), 24, availWidth) : 0;
  const coreText = coreCandidates.find((candidate) =>
    textWidth(candidate) + (candidate && detail ? 3 : 0) + detailReserve <= availWidth
  ) ?? "";
  const rightBudget = Math.max(
    availWidth - textWidth(coreText) - detailReserve - (detail && coreText ? 3 : 0) - 2,
    0
  );
  const rightText = rightBudget >= 10
    ? truncateCells(
        imageModeLabel ? `${imageModeLabel} · ${workspace}` : workspace,
        Math.min(Math.floor(termWidth * 0.4), 44, rightBudget)
      )
    : "";
  const leftWidth = Math.max(availWidth - textWidth(rightText) - (rightText ? 1 : 0), 1);
  const detailText = detail
    ? truncateCells(detail, Math.max(leftWidth - textWidth(coreText) - (coreText ? 3 : 0), 1))
    : "";

  return (
    <Box
      height={composerRows}
      flexShrink={0}
      overflow="hidden"
      flexDirection="column"
    >
      {completionItems.length > 0 && !inlinePickerOpen && (
        <CompletionPanel items={completionItems} highlight={completionHighlight} width={composerWidth} enterExecutes={isCompleteCommand(composerText(parts))} />
      )}
      {inlinePickerOpen && (
        <InlineInsertPanel
          items={inlinePickerItems}
          query={inlinePickerQuery}
          highlightIndex={inlinePickerHighlight}
          loading={inlinePickerLoading}
          width={composerWidth}
        />
      )}
      <Box height={1} width={composerWidth} marginX={1} justifyContent="flex-end" overflow="hidden">
        <Text color={DIM} wrap="truncate-end">? for shortcuts · /help</Text>
      </Box>
      <Box height={1} paddingX={1} overflow="hidden">
        <Text color={DIM}>{divider}</Text>
      </Box>
      <Box flexDirection="column" width={composerWidth} marginX={1}>
        <Box
          flexDirection="row"
          height={inputLayout.height}
          overflow="hidden"
          paddingX={1}
          backgroundColor={composerBg}
        >
          <Text color={ACCENT} backgroundColor={composerBg} bold>
            {`${PROMPT_GLYPH} `}
          </Text>
          {replyPrefix && (
            <Text color={ACCENT} backgroundColor={composerBg}>
              {replyPrefix}
            </Text>
          )}
          <Box
            width={inputWidth}
            height={inputLayout.height}
            flexShrink={0}
            overflow="hidden"
            backgroundColor={composerBg}
          >
            <PasteAwareTextInput
              parts={parts}
              cursorOffset={cursorOffset}
              onChange={onChange}
              onCursorChange={onCursorChange}
              onSubmit={onSubmit}
              onPaste={onPaste}
              focus={!helpMode && !facesMode && !forwardMode}
              placeholder={composerPlaceholder}
              placeholderColor={DIM}
              inlinePickerOpen={inlinePickerOpen || completionItems.length > 0}
              width={inputWidth}
              maxRows={5}
            />
          </Box>
        </Box>
        <Box height={1} overflow="hidden">
          <Text color={DIM}>{divider}</Text>
        </Box>
        <Box height={1} overflow="hidden" paddingX={1}>
          <Box width={leftWidth} flexShrink={0} overflow="hidden">
            <Text color={connected ? DIM : WARN} wrap="truncate-end">{coreText}</Text>
            {detailText && (
              <Text color={transientStatus || !connected ? WARN : DIM} wrap="truncate-end">
                {`${coreText ? " · " : ""}${detailText}`}
              </Text>
            )}
          </Box>
          <Box flexGrow={1} />
          {rightText && <Text color={DIM} wrap="truncate-end">{rightText}</Text>}
        </Box>
      </Box>
    </Box>
  );
}
