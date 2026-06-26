import React from "react";
import { Box, Text } from "ink";
import type { ImageMode } from "../config.js";
import type { Contact } from "../types.js";
import { truncateCells } from "../terminal-text.js";
import { HEADER_HEIGHT } from "./layout.js";

function sessionKind(contact: Contact | null) {
  if (!contact) return "no-session";
  return contact.type === "group" ? "channel" : "direct";
}

interface HeaderProps {
  connected: boolean;
  nickname: string;
  contactsCount: number;
  activeSession: Contact | null;
  unreadTotal: number;
  imageMode: ImageMode;
  termWidth: number;
}

export function Header({
  connected,
  nickname,
  contactsCount,
  activeSession,
  unreadTotal,
  imageMode,
  termWidth,
}: HeaderProps) {
  const divider = termWidth > 60 ? "─".repeat(termWidth) : "────";
  const accountLabel = nickname ? `acct:${nickname}` : "acct:pending";
  const sessionLabel = activeSession
    ? `${sessionKind(activeSession)}:${activeSession.name}`
    : "session:none";
  const headerMeta = [
    connected ? "online" : "reconnect",
    accountLabel,
    `${contactsCount} indexed`,
    `images:${imageMode}`,
    unreadTotal > 0 ? `${unreadTotal} unread` : "clean",
  ].join(" · ");
  const headerTitleWidth = Math.max(termWidth - 8, 12);

  return (
    <Box flexDirection="column" height={HEADER_HEIGHT} overflow="hidden">
      <Box flexDirection="row" paddingX={1} height={1} overflow="hidden">
        <Text color={connected ? "green" : "yellow"}>{connected ? "●" : "●"}</Text>
        <Text bold> qq-cli </Text>
        <Text dimColor wrap="truncate-end">
          {truncateCells(headerMeta, Math.max(termWidth - 10, 8))}
        </Text>
      </Box>
      <Box paddingX={1} height={1} overflow="hidden">
        <Text dimColor>
          {truncateCells(`─ ${sessionLabel} ${divider}`, headerTitleWidth)}
        </Text>
      </Box>
    </Box>
  );
}
