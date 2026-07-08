import React from "react";
import { Box, Text } from "ink";
import type { Contact } from "../types.js";
import { textWidth, truncateCells } from "../terminal-text.js";
import { HEADER_HEIGHT } from "./layout.js";

function sessionKind(contact: Contact | null) {
  if (!contact) return "no-session";
  return contact.type === "group" ? "channel" : "direct";
}

interface HeaderProps {
  connected: boolean;
  activeSession: Contact | null;
  unreadTotal: number;
  termWidth: number;
}

export function Header({
  connected,
  activeSession,
  unreadTotal,
  termWidth,
}: HeaderProps) {
  const sessionLabel = activeSession ? activeSession.name : "No session";
  const sessionKindLabel = activeSession ? sessionKind(activeSession) : "";
  const unreadLabel = unreadTotal > 0 ? `${unreadTotal} unread` : "";
  const sessionWidth = Math.max(Math.min(Math.floor(termWidth * 0.45), 40), 8);
  const displayedSession = truncateCells(sessionLabel, sessionWidth);
  const kindText = sessionKindLabel ? ` · ${sessionKindLabel}` : "";
  const unreadText = unreadLabel ? ` ${unreadLabel}` : "";
  const dividerWidth = Math.max(
    termWidth -
      2 -
      textWidth(`─ ${displayedSession}${kindText}${unreadText}`) -
      1,
    1
  );

  return (
    <Box flexDirection="column" height={HEADER_HEIGHT} overflow="hidden">
      <Box flexDirection="row" paddingX={2} height={1} overflow="hidden">
        <Text bold>qq-cli</Text>
        <Text dimColor> · </Text>
        <Text color={connected ? "green" : "yellow"}>
          {connected ? "online" : "reconnecting"}
        </Text>
      </Box>
      <Box paddingX={1} height={1} overflow="hidden">
        <Text dimColor>─ </Text>
        <Text>{displayedSession}</Text>
        {kindText && <Text dimColor>{kindText}</Text>}
        <Text dimColor> {"─".repeat(dividerWidth)}</Text>
        {unreadText && <Text color="yellow">{unreadText}</Text>}
      </Box>
    </Box>
  );
}
