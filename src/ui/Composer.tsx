import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { ImageAttachment } from "../clipboard-image.js";
import type { ImageMode } from "../config.js";
import type { Contact } from "../types.js";
import { textWidth, truncateCells } from "../terminal-text.js";
import { COMPOSER_ROWS } from "./layout.js";

interface ComposerProps {
  inputText: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  helpMode: boolean;
  modalMode: boolean;
  activeSession: Contact | null;
  statusMsg: string;
  connected: boolean;
  unreadTotal: number;
  termWidth: number;
  attachments: ImageAttachment[];
  imageMode: ImageMode;
}

export function Composer({
  inputText,
  onChange,
  onSubmit,
  helpMode,
  modalMode,
  activeSession,
  statusMsg,
  connected,
  unreadTotal,
  termWidth,
  attachments,
  imageMode,
}: ComposerProps) {
  const divider = "─".repeat(Math.max(termWidth - 2, 4));
  const composerWidth = Math.max(termWidth - 2, 12);
  const composerBg = "#3a3a3a";
  const workspace = helpMode
    ? "~/help"
    : modalMode
    ? "~/sessions"
    : activeSession
    ? `~/${activeSession.type === "group" ? "groups" : "directs"}/${activeSession.name.replaceAll("/", "∕")}`
    : "~/sessions";
  const displayedWorkspace = truncateCells(
    workspace,
    Math.max(Math.min(Math.floor(termWidth * 0.45), 44), 12)
  );
  const transientStatus = /loading|reloading|failed|unavailable|unknown|usage:|clipboard|attach|send/i.test(
    statusMsg
  )
    ? statusMsg
    : "";
  const composerPlaceholder = helpMode
    ? "Esc to close help"
    : modalMode
    ? "Filter sessions, then Enter"
    : activeSession
    ? "Message current session"
    : "Use /session to choose a session";
  const attachmentTokens = attachments
    .map((_, index) => `[Image #${index + 1}]`)
    .join(" ");
  const attachmentPrefix = attachmentTokens ? `${attachmentTokens} ` : "";
  const attachmentDisplayWidth = attachmentPrefix
    ? Math.min(textWidth(attachmentPrefix), Math.max(Math.floor(composerWidth * 0.45), 10))
    : 0;
  const inputChromeWidth = 4 + attachmentDisplayWidth;
  const inputVisibleWidth = Math.min(
    Math.max(textWidth(inputText || composerPlaceholder) + 1, 1),
    Math.max(composerWidth - inputChromeWidth - 2, 1)
  );
  const inputTailWidth = Math.max(
    composerWidth - inputVisibleWidth - inputChromeWidth - 2,
    0
  );
  const imageModeLabel = imageMode === "inline" ? "Images: inline" : "";
  const statusWidth = Math.max(composerWidth - textWidth(imageModeLabel) - 3, 1);

  return (
    <Box
      height={COMPOSER_ROWS}
      flexShrink={0}
      overflow="hidden"
      flexDirection="column"
    >
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
          {attachmentPrefix && (
            <Box width={attachmentDisplayWidth} flexShrink={0} overflow="hidden">
              <Text color="cyan" backgroundColor={composerBg} wrap="truncate-end">
                {attachmentPrefix}
              </Text>
            </Box>
          )}
          <Text color="white" backgroundColor={composerBg}>
            <TextInput
              value={inputText}
              onChange={onChange}
              onSubmit={onSubmit}
              focus={true}
              placeholder={composerPlaceholder}
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
