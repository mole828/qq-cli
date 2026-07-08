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
}: ComposerProps) {
  const divider = "─".repeat(Math.max(termWidth - 2, 4));
  const composerWidth = Math.max(termWidth - 2, 12);
  const composerHint = helpMode
    ? "Esc"
    : modalMode
    ? "↑↓ PgUp PgDn"
    : "/help /session /contacts /images";
  const composerStatus = helpMode
    ? "Help"
    : modalMode
    ? `Enter=open · Esc=close · ${unreadTotal} unread`
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
    ? "Message current session"
    : "Use /session to choose a session";
  const inputVisibleWidth = Math.min(
    Math.max(textWidth(inputText || composerPlaceholder) + 1, 1),
    Math.max(composerWidth - 6, 1)
  );
  const inputTailWidth = Math.max(composerWidth - inputVisibleWidth - 6, 0);

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
        <Box justifyContent="space-between" height={1} overflow="hidden" paddingX={1}>
          <Text
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
