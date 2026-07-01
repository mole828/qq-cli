import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { fillCells, textWidth } from "../terminal-text.js";
import { COMPOSER_ROWS } from "./layout.js";

interface ComposerProps {
  inputText: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  helpMode: boolean;
  modalMode: boolean;
  hasActiveSession: boolean;
  statusMsg: string;
  connected: boolean;
  unreadTotal: number;
  termWidth: number;
  messageScrollOffset: number;
}

export function Composer({
  inputText,
  onChange,
  onSubmit,
  helpMode,
  modalMode,
  hasActiveSession,
  statusMsg,
  connected,
  unreadTotal,
  termWidth,
  messageScrollOffset,
}: ComposerProps) {
  const divider = termWidth > 60 ? "─".repeat(termWidth) : "────";
  const composerWidth = Math.max(termWidth, 30);
  const composerHint = helpMode
    ? "Esc"
    : modalMode
    ? "↑↓ PgUp PgDn"
    : "↑↓ scroll · /help /session /contacts /images";
  const composerStatus = helpMode
    ? "Help"
    : modalMode
    ? `Enter=open · Esc=close · ${unreadTotal} unread`
    : messageScrollOffset > 0
    ? `${messageScrollOffset} newer messages below`
    : statusMsg || (connected ? "Ready" : "Connecting");
  const composerBg = "#3a3a3a";
  const composerStatusLine = fillCells(
    `${composerStatus} · ${composerHint}`,
    composerWidth - 2
  );
  const composerPlaceholder = helpMode
    ? "Esc to close help"
    : modalMode
    ? "Filter sessions, then Enter"
    : hasActiveSession
    ? "Input for current session"
    : "Use /session to choose a session";
  const inputVisibleWidth = Math.min(
    Math.max(textWidth(inputText || composerPlaceholder) + 1, 1),
    composerWidth - 4
  );
  const inputTailWidth = Math.max(composerWidth - inputVisibleWidth - 4, 0);

  return (
    <Box
      height={COMPOSER_ROWS}
      flexShrink={0}
      overflow="hidden"
      flexDirection="column"
    >
      <Box height={1}>
        <Text color="gray" dimColor>
          {divider}
        </Text>
      </Box>
      <Box flexDirection="column" width={composerWidth} paddingX={1} paddingY={0}>
        <Box flexDirection="row" height={1} overflow="hidden">
          <Text color="white" backgroundColor={composerBg} bold>
            ›{" "}
          </Text>
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
        <Box justifyContent="space-between" height={1} overflow="hidden">
          <Text
            color="white"
            backgroundColor={composerBg}
            dimColor
            wrap="truncate-end"
          >
            {composerStatusLine}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
